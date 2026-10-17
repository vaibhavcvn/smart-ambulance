import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../prisma.js';
import { authService } from '../../services/auth.service.js';
import { AdminBootstrapService } from '../../services/admin-bootstrap.service.js';
import { UserRole } from '@aurangabad-ambulance/shared';
import { ConflictError, ForbiddenError } from '../../common/errors/app-error.js';

describe('Phase 12: Authentication, Registration & Single Designated Admin Identity', () => {
  const createdUserIds: string[] = [];

  it('Scenario 1: allows patient registration with a valid new email address', async () => {
    const testEmail = `new.patient.${Date.now()}@aurangabad-ems.local`;
    const res = await authService.register({
      name: 'Test Patient Registration',
      email: testEmail,
      password: 'PatientPassword@123',
      phone: '+91-9876543210',
      role: UserRole.PATIENT,
    });

    expect(res.user).toBeDefined();
    expect(res.user.email).toBe(testEmail);
    expect(res.user.role).toBe(UserRole.PATIENT);
    expect(res.token).toBeDefined();
    createdUserIds.push(res.user.id);

    // Verify stored user in database
    const dbUser = await prisma.user.findUnique({ where: { id: res.user.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.email).toBe(testEmail);
  });

  it('Scenario 2: rejects duplicate email registration with a ConflictError', async () => {
    const duplicateEmail = `duplicate.test.${Date.now()}@aurangabad-ems.local`;
    const firstRes = await authService.register({
      name: 'Original Registrant',
      email: duplicateEmail,
      password: 'OriginalPassword@123',
      role: UserRole.PATIENT,
    });
    createdUserIds.push(firstRes.user.id);

    // Second registration with same email must fail
    await expect(
      authService.register({
        name: 'Duplicate Registrant',
        email: duplicateEmail,
        password: 'SecondPassword@123',
        role: UserRole.PATIENT,
      })
    ).rejects.toThrow(ConflictError);
  });

  it('Scenario 3: strictly prevents public registration from creating an ADMIN or elevated role account', async () => {
    const hackerEmail = `attempted.admin.${Date.now()}@evil.local`;

    await expect(
      authService.register({
        name: 'Malicious Attacker',
        email: hackerEmail,
        password: 'HackerPassword@123',
        role: UserRole.ADMIN as any,
      })
    ).rejects.toThrow(ForbiddenError);

    // Also verify DRIVER cannot be self-registered via public endpoint
    await expect(
      authService.register({
        name: 'Unverified Driver',
        email: `driver.self.${Date.now()}@evil.local`,
        password: 'DriverPassword@123',
        role: UserRole.DRIVER as any,
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it('Scenario 16: enforces the Single Designated Administrator constraint', async () => {
    // Assert existing admin count
    const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });
    expect(adminCount).toBeGreaterThanOrEqual(1);

    // Attempting to assertCanCreateAdmin when admin exists must throw ForbiddenError
    await expect(AdminBootstrapService.assertCanCreateAdmin()).rejects.toThrow(ForbiddenError);

    // Bootstrap is idempotent and will not create a second admin
    await AdminBootstrapService.ensureCanonicalAdmin();
    const adminCountAfter = await prisma.user.count({ where: { role: UserRole.ADMIN } });
    expect(adminCountAfter).toBe(adminCount);
  });

  it('Scenario 17: allows the same admin identity to maintain multiple legitimate device sessions', async () => {
    const adminUser = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
    expect(adminUser).not.toBeNull();

    // Session 1: Device A login
    const sessionDeviceA = await authService.login({
      email: adminUser!.email,
      password: 'Admin@12345',
    });

    // Session 2: Device B login
    const sessionDeviceB = await authService.login({
      email: adminUser!.email,
      password: 'Admin@12345',
    });

    expect(sessionDeviceA.user.id).toBe(adminUser!.id);
    expect(sessionDeviceB.user.id).toBe(adminUser!.id);
    expect(sessionDeviceA.token).toBeDefined();
    expect(sessionDeviceB.token).toBeDefined();
    // Tokens are valid JWTs with the stable canonical identity
    expect(sessionDeviceA.user.role).toBe(UserRole.ADMIN);
    expect(sessionDeviceB.user.role).toBe(UserRole.ADMIN);
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await prisma.user.deleteMany({ where: { id: uid } });
    }
  });
});
