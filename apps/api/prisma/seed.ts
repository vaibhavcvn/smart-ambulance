import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed for Aurangabad Smart Ambulance platform...');

  // Clean existing tables idempotently
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.trafficCorridor.deleteMany();
  await prisma.trafficBlockage.deleteMany();
  await prisma.locationUpdate.deleteMany();
  await prisma.tripStatusHistory.deleteMany();
  await prisma.dispatchRequest.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.hospitalStaff.deleteMany();
  await prisma.driverProfile.deleteMany();
  await prisma.ambulance.deleteMany();
  await prisma.hospital.deleteMany();
  await prisma.user.deleteMany();

  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('Admin@12345', salt);
  const patientPasswordHash = await bcrypt.hash('Patient@12345', salt);
  const driverPasswordHash = await bcrypt.hash('Driver@12345', salt);
  const hospitalPasswordHash = await bcrypt.hash('Hospital@12345', salt);
  const policePasswordHash = await bcrypt.hash('Police@12345', salt);

  // 1. Create Core Users
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@aurangabad-ems.gov.in',
      passwordHash: adminPasswordHash,
      name: 'Dr. Anand Deshmukh (Admin)',
      role: 'ADMIN',
      phone: '+91-240-2244100',
    },
  });

  const patientUser = await prisma.user.create({
    data: {
      email: 'patient@aurangabad-ems.local',
      passwordHash: patientPasswordHash,
      name: 'Vaibhav Patel',
      role: 'PATIENT',
      phone: '+91-9822011223',
    },
  });

  const policeUser = await prisma.user.create({
    data: {
      email: 'police.control@aurangabad-ems.local',
      passwordHash: policePasswordHash,
      name: 'Inspector Sanjay Kulkarni',
      role: 'TRAFFIC_POLICE',
      phone: '+91-240-2331100',
    },
  });

  // 2. Create Hospitals
  const ghatiHospital = await prisma.hospital.create({
    data: {
      name: 'GMCH Ghati Hospital (Government Medical College)',
      address: 'Panchakki Road, Juna Bazaar, Aurangabad - 431001',
      latitude: 19.8906,
      longitude: 75.3218,
      status: 'OPERATIONAL',
      availableEmergencyBeds: 24,
      availableIcuBeds: 12,
      availableGeneralBeds: 80,
      hasTraumaCenter: true,
      hasCathLab: true,
      hasStrokeUnit: true,
      phone: '+91-240-2402412',
    },
  });

  const mgmHospital = await prisma.hospital.create({
    data: {
      name: 'MGM Medical College & Hospital',
      address: 'N-6 CIDCO, Jalna Road, Aurangabad - 431003',
      latitude: 19.8791,
      longitude: 75.3644,
      status: 'OPERATIONAL',
      availableEmergencyBeds: 18,
      availableIcuBeds: 10,
      availableGeneralBeds: 60,
      hasTraumaCenter: true,
      hasCathLab: true,
      hasStrokeUnit: true,
      phone: '+91-240-6601100',
    },
  });

  const dhootHospital = await prisma.hospital.create({
    data: {
      name: 'Dhoot Hospital',
      address: 'Chikalthana MIDC, Jalna Road, Aurangabad - 431210',
      latitude: 19.8732,
      longitude: 75.3942,
      status: 'OPERATIONAL',
      availableEmergencyBeds: 14,
      availableIcuBeds: 8,
      availableGeneralBeds: 45,
      hasTraumaCenter: true,
      hasCathLab: true,
      hasStrokeUnit: false,
      phone: '+91-240-2478500',
    },
  });

  const ciigmaHospital = await prisma.hospital.create({
    data: {
      name: 'CIIGMA Hospital',
      address: 'Near Seven Hills Flyover, Jalna Road, Aurangabad - 431005',
      latitude: 19.8752,
      longitude: 75.3508,
      status: 'OPERATIONAL',
      availableEmergencyBeds: 10,
      availableIcuBeds: 6,
      availableGeneralBeds: 30,
      hasTraumaCenter: false,
      hasCathLab: true,
      hasStrokeUnit: true,
      phone: '+91-240-2354444',
    },
  });

  const hedgewarHospital = await prisma.hospital.create({
    data: {
      name: 'Dr. Hedgewar Rugnalaya',
      address: 'Garkheda Parisar, Aurangabad - 431009',
      latitude: 19.8654,
      longitude: 75.3521,
      status: 'OPERATIONAL',
      availableEmergencyBeds: 12,
      availableIcuBeds: 6,
      availableGeneralBeds: 40,
      hasTraumaCenter: false,
      hasCathLab: false,
      hasStrokeUnit: false,
      phone: '+91-240-2331195',
    },
  });

  // 3. Create Hospital Staff Users
  const staffGhatiUser = await prisma.user.create({
    data: {
      email: 'staff.ghati@aurangabad-ems.local',
      passwordHash: hospitalPasswordHash,
      name: 'Dr. Priya Sharma (Ghati ER Lead)',
      role: 'HOSPITAL_STAFF',
      phone: '+91-9823044111',
      hospitalStaff: {
        create: {
          hospitalId: ghatiHospital.id,
          roleTitle: 'Emergency Department Head',
        },
      },
    },
  });

  const staffMgmUser = await prisma.user.create({
    data: {
      email: 'staff.mgm@aurangabad-ems.local',
      passwordHash: hospitalPasswordHash,
      name: 'Dr. Rajesh More (MGM Triage)',
      role: 'HOSPITAL_STAFF',
      phone: '+91-9823055222',
      hospitalStaff: {
        create: {
          hospitalId: mgmHospital.id,
          roleTitle: 'Senior Triage Officer',
        },
      },
    },
  });

  // 4. Create Ambulances
  const amb1 = await prisma.ambulance.create({
    data: {
      registrationNumber: 'MH-20-AQ-1001',
      type: 'ALS',
      status: 'AVAILABLE',
      currentLatitude: 19.8762,
      currentLongitude: 75.3242, // Kranti Chowk
      isSimulated: false,
    },
  });

  const amb2 = await prisma.ambulance.create({
    data: {
      registrationNumber: 'MH-20-BT-2002',
      type: 'BLS',
      status: 'AVAILABLE',
      currentLatitude: 19.8885,
      currentLongitude: 75.3582, // CIDCO Connaught
      isSimulated: false,
    },
  });

  const amb3 = await prisma.ambulance.create({
    data: {
      registrationNumber: 'MH-20-CZ-3003',
      type: 'ALS',
      status: 'AVAILABLE',
      currentLatitude: 19.8398,
      currentLongitude: 75.2285, // Waluj MIDC
      isSimulated: false,
    },
  });

  const amb4 = await prisma.ambulance.create({
    data: {
      registrationNumber: 'MH-20-DE-4004',
      type: 'BLS',
      status: 'AVAILABLE',
      currentLatitude: 19.8778,
      currentLongitude: 75.3524, // Seven Hills
      isSimulated: false,
    },
  });

  // 5. Create Drivers
  const driverUser1 = await prisma.user.create({
    data: {
      email: 'driver.ramesh@aurangabad-ems.local',
      passwordHash: driverPasswordHash,
      name: 'Ramesh Shinde',
      role: 'DRIVER',
      phone: '+91-9890112233',
    },
  });

  const driverProfile1 = await prisma.driverProfile.create({
    data: {
      userId: driverUser1.id,
      licenseNumber: 'MH-20-2018-004521',
      status: 'AVAILABLE',
      currentLatitude: 19.8762,
      currentLongitude: 75.3242,
      assignedAmbulanceId: amb1.id,
    },
  });

  const driverUser2 = await prisma.user.create({
    data: {
      email: 'driver.sunil@aurangabad-ems.local',
      passwordHash: driverPasswordHash,
      name: 'Sunil Gaikwad',
      role: 'DRIVER',
      phone: '+91-9890223344',
    },
  });

  const driverProfile2 = await prisma.driverProfile.create({
    data: {
      userId: driverUser2.id,
      licenseNumber: 'MH-20-2019-007892',
      status: 'AVAILABLE',
      currentLatitude: 19.8885,
      currentLongitude: 75.3582,
      assignedAmbulanceId: amb2.id,
    },
  });

  const driverUser3 = await prisma.user.create({
    data: {
      email: 'driver.amit@aurangabad-ems.local',
      passwordHash: driverPasswordHash,
      name: 'Amit Jadhav',
      role: 'DRIVER',
      phone: '+91-9890334455',
    },
  });

  const driverProfile3 = await prisma.driverProfile.create({
    data: {
      userId: driverUser3.id,
      licenseNumber: 'MH-20-2020-001248',
      status: 'AVAILABLE',
      currentLatitude: 19.8398,
      currentLongitude: 75.2285,
      assignedAmbulanceId: amb3.id,
    },
  });

  // 6. Seed a sample traffic blockage
  await prisma.trafficBlockage.create({
    data: {
      title: 'Amarpreet Chowk Drainage Excavation',
      description: 'Single-lane closure on Jalna Road heading east towards Seven Hills.',
      roadName: 'Jalna Road',
      latitude: 19.877,
      longitude: 75.341,
      severity: 'MEDIUM',
      reportedByUserId: policeUser.id,
      isActive: true,
      estimatedDurationMinutes: 180,
    },
  });

  console.log('✅ Aurangabad Smart Ambulance seed completed successfully!');
  console.log('📋 DEMO CREDENTIALS:');
  console.log('   Admin:         admin@aurangabad-ems.gov.in           / Admin@12345');
  console.log('   Patient:       patient@aurangabad-ems.local          / Patient@12345');
  console.log('   Driver (ALS):  driver.ramesh@aurangabad-ems.local    / Driver@12345');
  console.log('   Driver (BLS):  driver.sunil@aurangabad-ems.local     / Driver@12345');
  console.log('   Driver (ALS):  driver.amit@aurangabad-ems.local      / Driver@12345');
  console.log('   Hospital Ghati:staff.ghati@aurangabad-ems.local      / Hospital@12345');
  console.log('   Hospital MGM:  staff.mgm@aurangabad-ems.local        / Hospital@12345');
  console.log('   Police:        police.control@aurangabad-ems.local   / Police@12345');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
