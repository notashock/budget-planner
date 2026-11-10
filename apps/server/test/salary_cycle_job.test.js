import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { SalaryCycleJob } from '../src/services/salaryCycleJob.js';

describe('SalaryCycleJob & Expected Salary Spotting Suite', () => {
  let app;
  let testUser;
  let authToken;
  let bankAccountId;

  beforeAll(async () => {
    app = createApp();

    const email = `salary_job_test_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123!' });

    expect(regRes.status).toBe(201);
    authToken = regRes.body.data.token;
    testUser = regRes.body.data.user;

    const bankRes = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'HDFC Corporate',
        type: 'bank',
        accountType: 'savings',
        openingBalance: 200000,
        isPrimary: true
      });
    expect(bankRes.status).toBe(201);
    bankAccountId = bankRes.body.data.id;
  });

  it('spots the predicted salary credit date with zero amount without logging a planned debit', async () => {
    const templateRes = await request(app)
      .post('/api/salary-templates')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 8500000,
        expectedCreditDay: 28,
        receivingAccountId: bankAccountId,
        periodType: 'salary_cycle',
        effectiveDate: '2026-10-28'
      });
    expect(templateRes.status).toBe(201);

    // Fetch transactions
    const txRes = await request(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`);
    expect(txRes.status).toBe(200);

    const plannedSalaryTx = txRes.body.data.find(
      (t) => t.origin === 'salary' && t.status === 'planned'
    );

    // Under Rule 1 (Pure Date Marker), NO planned salary transaction is created in the ledger
    expect(plannedSalaryTx).toBeUndefined();

    // Verify month has incomeCreditDate and incomeAmount metadata
    const monthsRes = await request(app)
      .get('/api/months')
      .set('Authorization', `Bearer ${authToken}`);
    expect(monthsRes.status).toBe(200);
    const activeMonth = monthsRes.body.data.find(m => !m.isClosed) || monthsRes.body.data[0];
    expect(activeMonth).toBeDefined();
    expect(activeMonth.incomeCreditDate).toBeDefined();
    expect(activeMonth.incomeAmount).toBe(8500000);
  });

  it('runs SalaryCycleJob and transitions active month cycle starting on the salary linked date', async () => {
    // Current active month
    const monthsRes = await request(app)
      .get('/api/months')
      .set('Authorization', `Bearer ${authToken}`);
    expect(monthsRes.status).toBe(200);

    const activeMonth = monthsRes.body.data.find((m) => !m.isClosed) || monthsRes.body.data[0];
    expect(activeMonth).toBeDefined();

    // Link salary to Nov 4 (e.g. via updateMonth)
    const updateRes = await request(app)
      .put(`/api/months/${activeMonth.year}/${activeMonth.month}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        salaryBankAccountId: bankAccountId,
        incomeAmount: 8500000,
        salaryCreditedDate: '2026-11-04',
        isSalaryCredited: true
      });
    expect(updateRes.status).toBe(200);

    // Execute SalaryCycleJob
    await SalaryCycleJob.processUserSalaryCycles(testUser.id);

    // Re-fetch months
    const updatedMonths = await request(app)
      .get('/api/months')
      .set('Authorization', `Bearer ${authToken}`);

    // Prior month should be closed with end date on 2026-11-03 (day before salary)
    const closedMonth = updatedMonths.body.data.find((m) => m.id === activeMonth.id);
    expect(closedMonth.isClosed).toBe(true);
    expect(closedMonth.endDate).toBe('2026-11-03');

    // Next month should start strictly on the salary linked date (2026-11-04)
    const nextMonth = updatedMonths.body.data.find((m) => !m.isClosed && m.id !== activeMonth.id);
    expect(nextMonth).toBeDefined();
    expect(nextMonth.startDate).toBe('2026-11-04');
    expect(nextMonth.isClosed).toBe(false);
  });
});
