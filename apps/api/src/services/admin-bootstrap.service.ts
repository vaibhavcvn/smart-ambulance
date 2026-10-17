import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { env } from '../config/env.js';
import { UserRole } from '@aurangabad-ambulance/shared';
import { ForbiddenError } from '../common/errors/app-error.js';

export class AdminBootstrapService {
  /**
   * Ensures the single designated administrator identity exists idempotently on system startup.
   * Never logs passwords, secrets, or tokens.
   * Never overwrites or resets an existing admin's password.
   */
  public static async ensureCanonicalAdmin(): Promise<void> {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
    });

    if (existingAdmin) {
      // Canonical admin identity already established; do not overwrite password or recreate
      return;
    }

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@aurangabad-ems.gov.in').toLowerCase().trim();
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@12345';

    const salt = await bcrypt.genSalt(env.BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(initialPassword, salt);

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'Dr. Anand Deshmukh (Admin)',
        role: UserRole.ADMIN,
        phone: '+91-240-2244100',
      },
    });

    // Record bootstrap audit log
    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_BOOTSTRAP_INITIALIZED',
        resourceType: 'USER',
        details: JSON.stringify({
          adminEmail,
          note: 'Canonical administrator identity initialized idempotently from secure environment config.',
        }),
      },
    });
  }

  /**
   * Enforces the Single Designated Administrator rule.
   * Throws if an administrator already exists and a caller tries to create or promote another.
   */
  public static async assertCanCreateAdmin(): Promise<void> {
    const adminCount = await prisma.user.count({
      where: { role: UserRole.ADMIN },
    });

    if (adminCount >= 1) {
      throw new ForbiddenError(
        'System policy violation: Exactly one canonical administrator identity is permitted in this platform. Additional administrator creation is strictly prohibited.'
      );
    }
  }
}
