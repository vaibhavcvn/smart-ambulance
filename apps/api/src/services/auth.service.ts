import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { env } from '../config/env.js';
import {
  LoginInput,
  RegisterInput,
  DriverApplicationInput,
  ProvisionHospitalStaffInput,
  ProvisionPoliceOfficerInput,
  AuthUser,
  UserRole,
  DriverApplicationStatus,
} from '@aurangabad-ambulance/shared';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../common/errors/app-error.js';
import { AdminBootstrapService } from './admin-bootstrap.service.js';

export class AuthService {
  public async login(input: LoginInput): Promise<{ user: AuthUser; token: string }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
      include: {
        driverProfile: true,
        hospitalStaff: true,
        trafficPoliceProfile: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      phone: user.phone,
      driverProfileId: user.driverProfile?.id || null,
      driverApplicationStatus: (user.driverProfile?.applicationStatus as DriverApplicationStatus) || null,
      hospitalId: user.hospitalStaff?.hospitalId || null,
      jurisdictionZone: user.trafficPoliceProfile?.jurisdictionZone || null,
    };

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        driverProfileId: authUser.driverProfileId,
        driverApplicationStatus: authUser.driverApplicationStatus,
        hospitalId: authUser.hospitalId,
        jurisdictionZone: authUser.jurisdictionZone,
      },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return { user: authUser, token };
  }

  /**
   * Public Registration (PHASE 5):
   * Strictly restricted to PATIENT role only.
   * Any client attempt to self-promote or supply ADMIN, DRIVER, HOSPITAL_STAFF, or TRAFFIC_POLICE
   * must be explicitly forbidden.
   */
  public async register(input: RegisterInput): Promise<{ user: AuthUser; token: string }> {
    if (input.role && input.role !== UserRole.PATIENT) {
      throw new ForbiddenError(
        'Public registration is strictly restricted to PATIENT accounts only. Drivers must apply via the driver onboarding workflow, and Hospital/Police staff must be provisioned by the Administrator.'
      );
    }

    const normalizedEmail = input.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictError('An account with this email address already exists. Please login instead.');
    }

    const salt = await bcrypt.genSalt(env.BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(input.password, salt);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: input.name.trim(),
        role: UserRole.PATIENT, // Forced PATIENT role
        phone: input.phone || null,
      },
    });

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: UserRole.PATIENT,
      phone: user.phone,
      driverProfileId: null,
      driverApplicationStatus: null,
      hospitalId: null,
      jurisdictionZone: null,
    };

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        driverProfileId: null,
        driverApplicationStatus: null,
        hospitalId: null,
        jurisdictionZone: null,
      },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return { user: authUser, token };
  }

  /**
   * Driver Application Workflow (PHASE 6):
   * An applicant registers with driver credentials and desired vehicle category.
   * Account is created with applicationStatus = PENDING_REVIEW.
   * Cannot accept dispatches or submit active trip GPS until approved by Administrator.
   */
  public async applyDriver(input: DriverApplicationInput): Promise<{ user: AuthUser; token: string; message: string }> {
    const normalizedEmail = input.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictError('An account with this email address already exists. Please login to check your application status.');
    }

    const salt = await bcrypt.genSalt(env.BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(input.password, salt);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: input.name.trim(),
          role: UserRole.DRIVER,
          phone: input.phone || null,
        },
      });

      const driverProfile = await tx.driverProfile.create({
        data: {
          userId: user.id,
          licenseNumber: input.licenseNumber.trim(),
          status: 'OFFLINE', // Remains offline until admin approves
          applicationStatus: DriverApplicationStatus.PENDING_REVIEW,
          vehicleTypeRequested: input.requestedAmbulanceType || 'BLS',
          vehicleRegistrationRequested: input.requestedAmbulanceRegistration || null,
          currentLatitude: 19.8762,
          currentLongitude: 75.3433,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'DRIVER_APPLICATION_SUBMITTED',
          resourceType: 'DRIVER_PROFILE',
          resourceId: driverProfile.id,
          details: JSON.stringify({
            applicantName: user.name,
            licenseNumber: input.licenseNumber,
            requestedAmbulanceType: input.requestedAmbulanceType,
            status: DriverApplicationStatus.PENDING_REVIEW,
          }),
        },
      });

      return { user, driverProfile };
    });

    const authUser: AuthUser = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: UserRole.DRIVER,
      phone: result.user.phone,
      driverProfileId: result.driverProfile.id,
      driverApplicationStatus: DriverApplicationStatus.PENDING_REVIEW,
      hospitalId: null,
      jurisdictionZone: null,
    };

    const token = jwt.sign(
      {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        driverProfileId: authUser.driverProfileId,
        driverApplicationStatus: DriverApplicationStatus.PENDING_REVIEW,
        hospitalId: null,
        jurisdictionZone: null,
      },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      user: authUser,
      token,
      message: 'Driver application submitted successfully and is currently PENDING_REVIEW by the Administrator.',
    };
  }

  /**
   * Provision Hospital Staff Account (PHASE 7):
   * Created only by authenticated Admin. Associated with a valid hospital ID.
   */
  public async provisionHospitalStaff(
    adminUserId: string,
    input: ProvisionHospitalStaffInput
  ): Promise<{ user: AuthUser; message: string }> {
    const hospital = await prisma.hospital.findUnique({
      where: { id: input.hospitalId },
    });

    if (!hospital) {
      throw new NotFoundError(`Hospital with ID "${input.hospitalId}" not found.`);
    }

    const normalizedEmail = input.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictError('A user account with this email address already exists.');
    }

    const salt = await bcrypt.genSalt(env.BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(input.password, salt);

    const createdStaff = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: input.name.trim(),
          role: UserRole.HOSPITAL_STAFF,
          phone: input.phone || null,
        },
      });

      const staff = await tx.hospitalStaff.create({
        data: {
          userId: user.id,
          hospitalId: hospital.id,
          roleTitle: input.roleTitle || 'Emergency Medical Officer',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'HOSPITAL_STAFF_PROVISIONED',
          resourceType: 'HOSPITAL_STAFF',
          resourceId: staff.id,
          details: JSON.stringify({
            staffEmail: user.email,
            hospitalId: hospital.id,
            hospitalName: hospital.name,
          }),
        },
      });

      return { user, staff };
    });

    return {
      user: {
        id: createdStaff.user.id,
        email: createdStaff.user.email,
        name: createdStaff.user.name,
        role: UserRole.HOSPITAL_STAFF,
        phone: createdStaff.user.phone,
        hospitalId: createdStaff.staff.hospitalId,
      },
      message: `Hospital staff account provisioned successfully for ${hospital.name}.`,
    };
  }

  /**
   * Provision Traffic Police Account (PHASE 8):
   * Created only by authenticated Admin. Assigned to specific jurisdiction zone.
   */
  public async provisionPoliceOfficer(
    adminUserId: string,
    input: ProvisionPoliceOfficerInput
  ): Promise<{ user: AuthUser; message: string }> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictError('A user account with this email address already exists.');
    }

    const salt = await bcrypt.genSalt(env.BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(input.password, salt);

    const createdOfficer = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: input.name.trim(),
          role: UserRole.TRAFFIC_POLICE,
          phone: input.phone || null,
        },
      });

      const policeProfile = await tx.trafficPoliceProfile.create({
        data: {
          userId: user.id,
          badgeNumber: input.badgeNumber.trim(),
          jurisdictionZone: input.jurisdictionZone.trim(),
          assignedPost: input.assignedPost?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'TRAFFIC_POLICE_PROVISIONED',
          resourceType: 'TRAFFIC_POLICE_PROFILE',
          resourceId: policeProfile.id,
          details: JSON.stringify({
            officerEmail: user.email,
            badgeNumber: policeProfile.badgeNumber,
            jurisdictionZone: policeProfile.jurisdictionZone,
          }),
        },
      });

      return { user, policeProfile };
    });

    return {
      user: {
        id: createdOfficer.user.id,
        email: createdOfficer.user.email,
        name: createdOfficer.user.name,
        role: UserRole.TRAFFIC_POLICE,
        phone: createdOfficer.user.phone,
        jurisdictionZone: createdOfficer.policeProfile.jurisdictionZone,
      },
      message: `Traffic police officer account provisioned for zone ${input.jurisdictionZone}.`,
    };
  }

  public async getProfile(userId: string): Promise<AuthUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        driverProfile: true,
        hospitalStaff: true,
        trafficPoliceProfile: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found.');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      phone: user.phone,
      driverProfileId: user.driverProfile?.id || null,
      driverApplicationStatus: (user.driverProfile?.applicationStatus as DriverApplicationStatus) || null,
      hospitalId: user.hospitalStaff?.hospitalId || null,
      jurisdictionZone: user.trafficPoliceProfile?.jurisdictionZone || null,
    };
  }
}

export const authService = new AuthService();
