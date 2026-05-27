import test from 'node:test';
import assert from 'node:assert';

const BASE_URL = 'http://localhost:3002';
const rand = () => Math.random().toString(36).substring(7);

test('CRM Inmobiliario API Security & Tenant Isolation Tests', async (t) => {
  const emailA = `usera_${rand()}@test.com`;
  const agencyNameA = `Agency A ${rand()}`;
  const password = 'SuperSecurePassword123!';

  const emailB = `userb_${rand()}@test.com`;
  const agencyNameB = `Agency B ${rand()}`;

  let tokenA = '';
  let tokenB = '';
  let leadIdA = '';
  let propertyIdA = '';

  await t.test('1. Register Agency A + Admin A', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailA,
        password,
        name: 'Admin A',
        phone: '123456789',
        agencyName: agencyNameA,
        agencyCity: 'Madrid',
        plan: 'starter'
      })
    });

    if (res.status !== 201) {
      console.error('Register A failed:', await res.text());
    }
    assert.strictEqual(res.status, 201, `Expected 201 Created but got ${res.status}`);
    const data = await res.json();
    assert.ok(data.user_id, 'Should return user_id');
    assert.ok(data.agency_id, 'Should return agency_id');
    assert.strictEqual(data.email, emailA);
  });

  await t.test('2. Register Agency B + Admin B', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailB,
        password,
        name: 'Admin B',
        phone: '987654321',
        agencyName: agencyNameB,
        agencyCity: 'Barcelona',
        plan: 'starter'
      })
    });

    if (res.status !== 201) {
      console.error('Register B failed:', await res.text());
    }
    assert.strictEqual(res.status, 201, `Expected 201 Created but got ${res.status}`);
    const data = await res.json();
    assert.ok(data.user_id, 'Should return user_id');
  });

  await t.test('3. Login User A & User B to retrieve signed JWTs', async () => {
    // Login User A
    const resA = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password })
    });
    if (resA.status !== 200) {
      console.error('Login A failed:', await resA.text());
    }
    assert.strictEqual(resA.status, 200);
    const dataA = await resA.json();
    assert.ok(dataA.token, 'Should return JWT token for user A');
    tokenA = dataA.token;

    // Login User B
    const resB = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password })
    });
    if (resB.status !== 200) {
      console.error('Login B failed:', await resB.text());
    }
    assert.strictEqual(resB.status, 200);
    const dataB = await resB.json();
    assert.ok(dataB.token, 'Should return JWT token for user B');
    tokenB = dataB.token;
  });

  await t.test('4. Create a Lead for Agency A using Token A', async () => {
    const res = await fetch(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        name: 'Cliente Interesado A',
        email: 'lead_clienta@example.com',
        phone: '612345678',
        property_interest: 'Piso céntrico',
        budget: 250000,
        pipeline_stage: 'nuevo',
        canal: 'web'
      })
    });

    if (res.status !== 201) {
      console.error('Create Lead failed:', await res.text());
    }
    assert.strictEqual(res.status, 201, `Expected 201 Created but got ${res.status}`);
    const data = await res.json();
    assert.ok(data.id, 'Should return created lead id');
    leadIdA = data.id;
  });

  await t.test('5. Create a Property for Agency A using Token A', async () => {
    const res = await fetch(`${BASE_URL}/api/properties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        title: 'Ático Duplex en Salamanca',
        description: 'Impresionante terraza y luz',
        price: 450000,
        type: 'ático',
        city: 'Madrid',
        zone: 'Salamanca',
        bedrooms: 3,
        bathrooms: 2,
        surface: 120,
        features: ['terraza', 'piscina']
      })
    });

    if (res.status !== 201) {
      console.error('Create Property failed:', await res.text());
    }
    assert.strictEqual(res.status, 201, `Expected 201 Created but got ${res.status}`);
    const data = await res.json();
    assert.ok(data.id, 'Should return created property id');
    propertyIdA = data.id;
  });

  await t.test('6. Enforce Multi-tenant isolation: User B trying to access Lead A', async () => {
    const res = await fetch(`${BASE_URL}/api/leads/${leadIdA}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenB}`
      }
    });

    if (res.status !== 404) {
      console.error('Access Lead A by B failed, status:', res.status, await res.text());
    }
    // Should return 404 since lead query scopes by agency_id
    assert.strictEqual(res.status, 404, `Expected 404 Not Found under User B's scope, but got ${res.status}`);
  });

  await t.test('7. Enforce Multi-tenant isolation: User B trying to access Property A', async () => {
    const res = await fetch(`${BASE_URL}/api/properties/${propertyIdA}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenB}`
      }
    });

    if (res.status !== 404) {
      console.error('Access Property A by B failed, status:', res.status, await res.text());
    }
    // Should return 404 since property query scopes by agency_id
    assert.strictEqual(res.status, 404, `Expected 404 Not Found under User B's scope, but got ${res.status}`);
  });

  await t.test('8. Enforce Multi-tenant isolation: User B trying to edit Property A', async () => {
    const res = await fetch(`${BASE_URL}/api/properties/${propertyIdA}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({
        price: 150000 // attempting unauthorized price dump
      })
    });

    if (res.status !== 404) {
      console.error('Edit Property A by B failed, status:', res.status, await res.text());
    }
    // Should return 404 since property patch scopes by agency_id
    assert.strictEqual(res.status, 404, `Expected 404 Not Found under User B's scope, but got ${res.status}`);
  });

  let appointmentToken = '';
  let appointmentId = '';

  await t.test('9. Create Appointment for Lead A', async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000 * 5).toISOString(); // 5 days in the future
    const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000 * 5 + 30 * 60 * 1000).toISOString();

    const res = await fetch(`${BASE_URL}/api/leads/${leadIdA}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        type: 'online',
        starts_at: futureDate,
        ends_at: endDate,
        notes: 'Videollamada de cualificación de prueba.',
        attendant_name: 'Asesor Principal'
      })
    });

    if (res.status !== 201) {
      console.error('Create Appointment failed:', await res.text());
    }
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.appointment.id, 'Should return created appointment id');
    assert.ok(data.appointment.client_token, 'Should generate secure unique client token');
    
    appointmentId = data.appointment.id;
    appointmentToken = data.appointment.client_token;
  });

  await t.test('10. Get Appointments list for Lead A', async () => {
    const res = await fetch(`${BASE_URL}/api/leads/${leadIdA}/appointments`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenA}`
      }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.ok(data.length > 0);
    assert.strictEqual(data[0].id, appointmentId);
  });

  await t.test('11. Get Public Appointment Details using Client Token', async () => {
    const res = await fetch(`${BASE_URL}/api/public/appointment/${appointmentToken}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.appointment.id, appointmentId);
    assert.strictEqual(data.lead.id, leadIdA);
    assert.ok(data.agency.name);
  });

  await t.test('12. Public Client Portal: Confirm Attendance', async () => {
    const res = await fetch(`${BASE_URL}/api/public/appointment/${appointmentToken}/confirm`, {
      method: 'POST'
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'confirmed');

    // Confirm state has updated in database
    const checkRes = await fetch(`${BASE_URL}/api/public/appointment/${appointmentToken}`);
    const checkData = await checkRes.json();
    assert.strictEqual(checkData.appointment.status, 'confirmed');
  });

  await t.test('13. Public Client Portal: Request Reschedule', async () => {
    const newStarts = new Date(Date.now() + 24 * 60 * 60 * 1000 * 10).toISOString(); // 10 days in the future
    const newEnds = new Date(Date.now() + 24 * 60 * 60 * 1000 * 10 + 45 * 60 * 1000).toISOString();

    const res = await fetch(`${BASE_URL}/api/public/appointment/${appointmentToken}/reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        starts_at: newStarts,
        ends_at: newEnds,
        notes: 'Deseo reprogramar para la semana que viene por favor.'
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'reschedule_requested');
    assert.strictEqual(data.appointment.starts_at, newStarts);
  });

  await t.test('14. Public Client Portal Tenant Scoping: Invalid Token', async () => {
    const res = await fetch(`${BASE_URL}/api/public/appointment/invalid-random-token-here`);
    assert.strictEqual(res.status, 404);
  });
});
