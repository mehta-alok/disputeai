/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Database Seed Script
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🛡️ AccuDefend System - Seeding Database...\n');

  // ==========================================================================
  // CREATE PROPERTIES (DEMO HOTELS)
  // ==========================================================================

  console.log('Creating demo hotel properties...');

  const properties = await Promise.all([
    prisma.property.upsert({
      where: { id: 'prop-demo-atlanta' },
      update: {},
      create: {
        id: 'prop-demo-atlanta',
        name: 'Grand Atlanta Hotel',
        address: '100 Peachtree St',
        city: 'Atlanta',
        state: 'GA',
        country: 'US',
        postalCode: '30303',
        timezone: 'America/New_York',
        currency: 'USD'
      }
    }),
    prisma.property.upsert({
      where: { id: 'prop-demo-dallas' },
      update: {},
      create: {
        id: 'prop-demo-dallas',
        name: 'Dallas Downtown Hotel',
        address: '555 S Lamar St',
        city: 'Dallas',
        state: 'TX',
        country: 'US',
        postalCode: '75202',
        timezone: 'America/Chicago',
        currency: 'USD'
      }
    }),
    prisma.property.upsert({
      where: { id: 'prop-demo-boston' },
      update: {},
      create: {
        id: 'prop-demo-boston',
        name: 'Boston Heritage Hotel',
        address: '60 School St',
        city: 'Boston',
        state: 'MA',
        country: 'US',
        postalCode: '02108',
        timezone: 'America/New_York',
        currency: 'USD'
      }
    }),
    prisma.property.upsert({
      where: { id: 'prop-demo-sandiego' },
      update: {},
      create: {
        id: 'prop-demo-sandiego',
        name: 'San Diego Bay Hotel',
        address: '675 L St',
        city: 'San Diego',
        state: 'CA',
        country: 'US',
        postalCode: '92101',
        timezone: 'America/Los_Angeles',
        currency: 'USD'
      }
    })
  ]);

  console.log(`✓ Created ${properties.length} demo hotel properties\n`);

  // ==========================================================================
  // CREATE PAYMENT PROVIDERS
  // ==========================================================================

  console.log('Creating payment providers...');

  const providers = await Promise.all([
    prisma.provider.upsert({
      where: { id: 'prov-stripe' },
      update: {},
      create: {
        id: 'prov-stripe',
        name: 'Stripe',
        type: 'PAYMENT_PROCESSOR',
        enabled: true
      }
    }),
    prisma.provider.upsert({
      where: { id: 'prov-adyen' },
      update: {},
      create: {
        id: 'prov-adyen',
        name: 'Adyen',
        type: 'PAYMENT_PROCESSOR',
        enabled: true
      }
    }),
    prisma.provider.upsert({
      where: { id: 'prov-shift4' },
      update: {},
      create: {
        id: 'prov-shift4',
        name: 'Shift4',
        type: 'PAYMENT_PROCESSOR',
        enabled: true
      }
    }),
    prisma.provider.upsert({
      where: { id: 'prov-elavon' },
      update: {},
      create: {
        id: 'prov-elavon',
        name: 'Elavon',
        type: 'PAYMENT_PROCESSOR',
        enabled: true
      }
    }),
    prisma.provider.upsert({
      where: { id: 'prov-mews' },
      update: {},
      create: {
        id: 'prov-mews',
        name: 'Mews PMS',
        type: 'PMS',
        enabled: true
      }
    }),
    prisma.provider.upsert({
      where: { id: 'prov-oracle' },
      update: {},
      create: {
        id: 'prov-oracle',
        name: 'Oracle Opera Cloud',
        type: 'PMS',
        enabled: true
      }
    })
  ]);

  console.log(`✓ Created ${providers.length} payment/PMS providers\n`);

  // ==========================================================================
  // CREATE USERS
  // ==========================================================================

  console.log('Creating users...');

  const passwordHash = await bcrypt.hash('AccuAdmin123!', 12);
  const demoPasswordHash = await bcrypt.hash('Demo2024!', 12);
  const alokPasswordHash = await bcrypt.hash('Alok@123', 12);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@accudefend.com' },
      update: {},
      create: {
        email: 'admin@accudefend.com',
        passwordHash,
        firstName: 'System',
        lastName: 'Administrator',
        role: 'ADMIN'
      }
    }),
    // New Demo User
    prisma.user.upsert({
      where: { email: 'demo@accudefend.com' },
      update: {},
      create: {
        email: 'demo@accudefend.com',
        passwordHash: demoPasswordHash,
        firstName: 'Demo',
        lastName: 'User',
        role: 'ADMIN'
      }
    }),
    // Alok User
    prisma.user.upsert({
      where: { email: 'alok@accudefend.com' },
      update: {},
      create: {
        email: 'alok@accudefend.com',
        passwordHash: alokPasswordHash,
        firstName: 'Alok',
        lastName: 'Mehta',
        role: 'ADMIN'
      }
    }),
    prisma.user.upsert({
      where: { email: 'manager.atlanta@accudefend.com' },
      update: {},
      create: {
        email: 'manager.atlanta@accudefend.com',
        passwordHash,
        firstName: 'Sarah',
        lastName: 'Johnson',
        role: 'MANAGER',
        propertyId: 'prop-demo-atlanta'
      }
    }),
    prisma.user.upsert({
      where: { email: 'staff.atlanta@accudefend.com' },
      update: {},
      create: {
        email: 'staff.atlanta@accudefend.com',
        passwordHash,
        firstName: 'Mike',
        lastName: 'Williams',
        role: 'STAFF',
        propertyId: 'prop-demo-atlanta'
      }
    }),
    prisma.user.upsert({
      where: { email: 'manager.dallas@accudefend.com' },
      update: {},
      create: {
        email: 'manager.dallas@accudefend.com',
        passwordHash,
        firstName: 'Jennifer',
        lastName: 'Martinez',
        role: 'MANAGER',
        propertyId: 'prop-demo-dallas'
      }
    })
  ]);

  console.log(`✓ Created ${users.length} users\n`);

  // ==========================================================================
  // CREATE SAMPLE CHARGEBACKS
  // ==========================================================================

  console.log('Creating sample chargebacks...');

  const chargebacks = await Promise.all([
    prisma.chargeback.upsert({
      where: { caseNumber: 'CB-2025-0001' },
      update: {},
      create: {
        caseNumber: 'CB-2025-0001',
        status: 'IN_REVIEW',
        guestName: 'John Smith',
        guestEmail: 'john.smith@email.com',
        guestPhone: '+1-555-123-4567',
        amount: 459.99,
        currency: 'USD',
        transactionId: 'txn_3abc123def456',
        cardLastFour: '4242',
        cardBrand: 'Visa',
        reasonCode: '13.1',
        reasonDescription: 'Services Not Received',
        disputeDate: new Date('2025-01-15'),
        dueDate: new Date('2025-02-15'),
        processorDisputeId: 'dp_1abc123',
        checkInDate: new Date('2025-01-10'),
        checkOutDate: new Date('2025-01-13'),
        roomNumber: '1205',
        roomType: 'Deluxe King',
        confirmationNumber: 'AD-ATL-789456',
        confidenceScore: 78,
        recommendation: 'REVIEW_RECOMMENDED',
        fraudIndicators: {
          positive: ['matching_id', 'long_stay'],
          negative: ['foreign_card']
        },
        propertyId: 'prop-demo-atlanta',
        providerId: 'prov-stripe'
      }
    }),
    prisma.chargeback.upsert({
      where: { caseNumber: 'CB-2025-0002' },
      update: {},
      create: {
        caseNumber: 'CB-2025-0002',
        status: 'PENDING',
        guestName: 'Maria Garcia',
        guestEmail: 'mgarcia@company.com',
        amount: 1245.50,
        currency: 'USD',
        transactionId: 'txn_4xyz789ghi012',
        cardLastFour: '1234',
        cardBrand: 'Mastercard',
        reasonCode: '4855',
        reasonDescription: 'Non-Receipt of Merchandise',
        disputeDate: new Date('2025-01-20'),
        dueDate: new Date('2025-02-20'),
        checkInDate: new Date('2025-01-05'),
        checkOutDate: new Date('2025-01-09'),
        roomNumber: '802',
        roomType: 'Executive Suite',
        confirmationNumber: 'AD-DAL-123789',
        confidenceScore: 92,
        recommendation: 'AUTO_SUBMIT',
        fraudIndicators: {
          positive: ['matching_id', 'repeat_guest', 'corporate_booking'],
          negative: []
        },
        propertyId: 'prop-demo-dallas',
        providerId: 'prov-adyen'
      }
    }),
    prisma.chargeback.upsert({
      where: { caseNumber: 'CB-2025-0003' },
      update: {},
      create: {
        caseNumber: 'CB-2025-0003',
        status: 'WON',
        guestName: 'Robert Chen',
        amount: 325.00,
        currency: 'USD',
        transactionId: 'txn_5mno345pqr678',
        cardLastFour: '5678',
        cardBrand: 'Amex',
        reasonCode: '10.4',
        reasonDescription: 'Fraud - Card Absent Environment',
        disputeDate: new Date('2024-12-01'),
        dueDate: new Date('2025-01-01'),
        checkInDate: new Date('2024-11-20'),
        checkOutDate: new Date('2024-11-22'),
        roomNumber: '415',
        roomType: 'Standard Double',
        confidenceScore: 85,
        recommendation: 'AUTO_SUBMIT',
        resolvedAt: new Date('2025-01-05'),
        propertyId: 'prop-demo-boston',
        providerId: 'prov-stripe'
      }
    }),
    prisma.chargeback.upsert({
      where: { caseNumber: 'CB-2025-0004' },
      update: {},
      create: {
        caseNumber: 'CB-2025-0004',
        status: 'LOST',
        guestName: 'Emily Watson',
        amount: 578.25,
        currency: 'USD',
        transactionId: 'txn_6stu901vwx234',
        cardLastFour: '9012',
        cardBrand: 'Visa',
        reasonCode: '13.3',
        reasonDescription: 'Not as Described or Defective',
        disputeDate: new Date('2024-11-15'),
        dueDate: new Date('2024-12-15'),
        checkInDate: new Date('2024-11-01'),
        checkOutDate: new Date('2024-11-03'),
        roomNumber: '610',
        roomType: 'Ocean View Suite',
        confidenceScore: 35,
        recommendation: 'UNLIKELY_TO_WIN',
        resolvedAt: new Date('2024-12-20'),
        propertyId: 'prop-demo-sandiego',
        providerId: 'prov-shift4'
      }
    })
  ]);

  console.log(`✓ Created ${chargebacks.length} sample chargebacks\n`);

  // ==========================================================================
  // CREATE TIMELINE EVENTS
  // ==========================================================================

  console.log('Creating timeline events...');

  await prisma.timelineEvent.createMany({
    data: [
      {
        chargebackId: chargebacks[0].id,
        eventType: 'ALERT',
        title: 'Chargeback Received',
        description: 'New dispute notification received from Stripe'
      },
      {
        chargebackId: chargebacks[0].id,
        eventType: 'AI',
        title: 'AI Analysis Complete',
        description: 'Confidence score: 78%. Recommendation: Review Recommended'
      },
      {
        chargebackId: chargebacks[0].id,
        eventType: 'USER_ACTION',
        title: 'Evidence Uploaded',
        description: 'ID scan and folio uploaded by staff'
      },
      {
        chargebackId: chargebacks[2].id,
        eventType: 'SUCCESS',
        title: 'Dispute Won',
        description: 'Bank ruled in favor of the hotel'
      }
    ],
    skipDuplicates: true
  });

  console.log('✓ Created timeline events\n');

  // ==========================================================================
  // CREATE SYSTEM CONFIG
  // ==========================================================================

  console.log('Creating system configuration...');

  await prisma.systemConfig.upsert({
    where: { key: 'ai_thresholds' },
    update: {},
    create: {
      key: 'ai_thresholds',
      value: {
        autoSubmit: 85,
        reviewRecommended: 70,
        gatherMoreEvidence: 50
      },
      description: 'AI confidence score thresholds for recommendations'
    }
  });

  await prisma.systemConfig.upsert({
    where: { key: 'evidence_weights' },
    update: {},
    create: {
      key: 'evidence_weights',
      value: {
        ID_SCAN: 20,
        AUTH_SIGNATURE: 20,
        CHECKOUT_SIGNATURE: 15,
        FOLIO: 15,
        KEY_CARD_LOG: 10,
        CORRESPONDENCE: 10,
        CCTV_FOOTAGE: 5,
        CANCELLATION_POLICY: 5
      },
      description: 'Evidence type weights for confidence scoring'
    }
  });

  console.log('✓ Created system configuration\n');

  // ==========================================================================
  // CREATE DEMO NOTIFICATIONS
  // ==========================================================================

  console.log('Creating demo notifications...');

  // Get all admin users for notifications
  const adminUsers = await prisma.user.findMany({
    where: { role: 'ADMIN' }
  });

  if (adminUsers.length > 0) {
    const demoNotifications = [];
    const now = new Date();

    adminUsers.forEach(user => {
      demoNotifications.push(
        {
          userId: user.id,
          type: 'NEW_CHARGEBACK',
          priority: 'HIGH',
          title: 'New Chargeback Received',
          message: 'A new $450.00 chargeback has been filed for case CB-2025-0008. Immediate review recommended.',
          link: '/cases',
          isRead: false,
          createdAt: new Date(now.getTime() - 5 * 60 * 1000) // 5 minutes ago
        },
        {
          userId: user.id,
          type: 'DEADLINE_WARNING',
          priority: 'URGENT',
          title: 'Response Deadline Approaching',
          message: 'Case CB-2025-0005 response is due in 3 days. Please review and submit evidence.',
          link: '/cases',
          isRead: false,
          createdAt: new Date(now.getTime() - 30 * 60 * 1000) // 30 minutes ago
        },
        {
          userId: user.id,
          type: 'AI_ANALYSIS_COMPLETE',
          priority: 'MEDIUM',
          title: 'AI Analysis Complete',
          message: 'Case CB-2025-0006 analysis finished with 87% confidence score. Auto-submit criteria met.',
          link: '/cases',
          isRead: false,
          createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) // 2 hours ago
        },
        {
          userId: user.id,
          type: 'SUBMISSION_RESULT',
          priority: 'MEDIUM',
          title: 'Dispute Response Submitted',
          message: 'Case CB-2025-0003 response has been successfully submitted to Stripe.',
          link: '/cases',
          isRead: true,
          readAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
          createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000) // 4 hours ago
        },
        {
          userId: user.id,
          type: 'PMS_SYNC_COMPLETE',
          priority: 'LOW',
          title: 'PMS Sync Completed',
          message: 'Successfully synced 12 new reservations from Opera PMS.',
          link: '/pms',
          isRead: true,
          readAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
          createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000) // 6 hours ago
        }
      );
    });

    await prisma.notification.createMany({
      data: demoNotifications,
      skipDuplicates: true
    });

    console.log(`✓ Created ${demoNotifications.length} demo notifications\n`);
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ACCUDEFEND SYSTEM - Seed Complete');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Properties:    ${properties.length}`);
  console.log(`  Providers:     ${providers.length}`);
  console.log(`  Users:         ${users.length}`);
  console.log(`  Chargebacks:   ${chargebacks.length}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n  Login Credentials:');
  console.log('  ───────────────────────────────────────');
  console.log('  Admin:    admin@accudefend.com / AccuAdmin123!');
  console.log('  Demo:     demo@accudefend.com / Demo2024!');
  console.log('  Alok:     alok@accudefend.com / Alok@123');
  console.log('  ───────────────────────────────────────');
  console.log('\n');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
