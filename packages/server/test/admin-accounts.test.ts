import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DEFAULT_THEME, type AdminUserDTO, type PasswordResetRequestDTO, type ThemeSettings, type UserDTO } from '@guadalupana/shared';
import { startTestServer, type TestContext } from './helpers.ts';

const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
const json = async <T>(res: Response) => (await res.json()) as T;

describe('Administración, cuentas y contraseñas', () => {
  let t: TestContext;
  let admin: string;
  let analyst: string;
  let applicant: string;

  before(async () => {
    t = await startTestServer();
    admin = await t.login('admin');
    analyst = await t.login('ana.lopez');
    applicant = await t.login('juan.perez');
  });
  after(() => t.close());

  it('solo el ADMIN accede a /api/admin (la protección está en el servidor, no en la interfaz)', async () => {
    for (const cookie of [applicant, analyst]) {
      assert.equal((await t.api('GET', '/api/admin/users', { cookie })).status, 403);
      assert.equal((await t.api('PUT', '/api/admin/settings/theme', { cookie, body: DEFAULT_THEME })).status, 403);
    }
    assert.equal((await t.api('GET', '/api/admin/users', { cookie: admin })).status, 200);
    assert.equal((await t.api('GET', '/api/admin/overview', { cookie: admin })).status, 200);
  });

  it('segregación de funciones: el ADMIN consulta solicitudes pero no puede aprobarlas', async () => {
    const request = await t.createInReview(analyst, applicant);
    assert.equal((await t.api('GET', `/api/requests/${request.id}`, { cookie: admin })).status, 200);
    const approve = await t.api('POST', `/api/requests/${request.id}/approve`, { cookie: admin, headers: { 'Idempotency-Key': 'admin-approve-1' } });
    assert.equal(approve.status, 403);
  });

  it('el registro público siempre crea un SOLICITANTE y rechaza intentos de elegir rol', async () => {
    const base = { fullName: 'Lucía Tzoc', username: 'lucia.tzoc', password: 'Ahorro#2026x', confirmPassword: 'Ahorro#2026x' };
    const escalation = await t.api('POST', '/api/auth/register', { body: { ...base, role: 'ADMIN' } });
    assert.equal(escalation.status, 400, 'un campo extra como "role" se rechaza');

    const weak = await t.api('POST', '/api/auth/register', { body: { ...base, password: 'corta', confirmPassword: 'corta' } });
    assert.equal(weak.status, 400);

    const ok = await t.api('POST', '/api/auth/register', { body: base });
    assert.equal(ok.status, 201);
    assert.equal((await json<{ user: UserDTO }>(ok)).user.role, 'SOLICITANTE');
    assert.equal((await t.api('GET', '/api/admin/users', { cookie: cookieOf(ok) })).status, 403);

    const duplicate = await t.api('POST', '/api/auth/register', { body: base });
    assert.equal(duplicate.status, 422);
  });

  it('olvido de contraseña: misma respuesta exista o no el usuario; el admin la resuelve con una temporal', async () => {
    const real = await t.api('POST', '/api/auth/forgot-password', { body: { username: 'maria.garcia' } });
    const ghost = await t.api('POST', '/api/auth/forgot-password', { body: { username: 'no.existe' } });
    assert.equal(real.status, 202);
    assert.equal(ghost.status, 202);
    assert.deepEqual(await real.json(), await ghost.json());

    const maria = await t.login('maria.garcia');
    const { requests } = await json<{ requests: PasswordResetRequestDTO[] }>(await t.api('GET', '/api/admin/password-resets', { cookie: admin }));
    const pending = requests.find((r) => r.username === 'maria.garcia');
    assert.ok(pending, 'la solicitud real aparece; la inexistente no');
    assert.equal(requests.some((r) => r.username === 'no.existe'), false);

    const reset = await t.api('POST', `/api/admin/users/${pending.userId}/reset-password`, { cookie: admin });
    const { temporaryPassword } = await json<{ temporaryPassword: string }>(reset);

    assert.equal((await t.api('GET', '/api/requests', { cookie: maria })).status, 401, 'la sesión anterior queda invalidada');

    const login = await t.api('POST', '/api/auth/login', { body: { username: 'maria.garcia', password: temporaryPassword } });
    const temp = cookieOf(login);
    assert.equal((await json<{ user: UserDTO }>(login)).user.mustChangePassword, true);
    const blocked = await t.api('GET', '/api/requests', { cookie: temp });
    assert.equal(blocked.status, 403);
    assert.equal((await json<{ error: { code: string } }>(blocked)).error.code, 'PASSWORD_CHANGE_REQUIRED');

    const changed = await t.api('POST', '/api/auth/change-password', {
      cookie: temp,
      body: { currentPassword: temporaryPassword, newPassword: 'Nueva#Clave2026', confirmPassword: 'Nueva#Clave2026' },
    });
    assert.equal(changed.status, 200);
    assert.equal((await t.api('GET', '/api/requests', { cookie: cookieOf(changed) })).status, 200);
  });

  it('el último administrador no puede quitarse el rol ni desactivarse', async () => {
    const { users } = await json<{ users: AdminUserDTO[] }>(await t.api('GET', '/api/admin/users', { cookie: admin }));
    const self = users.find((u) => u.username === 'admin');
    assert.ok(self);
    const demote = await t.api('PATCH', `/api/admin/users/${self.id}`, { cookie: admin, body: { role: 'ANALISTA' } });
    assert.equal(demote.status, 409);
    const deactivate = await t.api('PATCH', `/api/admin/users/${self.id}`, { cookie: admin, body: { isActive: false } });
    assert.equal(deactivate.status, 409);
  });

  it('desactivar a un usuario cierra su sesión de inmediato', async () => {
    const created = await t.api('POST', '/api/admin/users', { cookie: admin, body: { fullName: 'Pedro Analista', username: 'pedro.analista', role: 'ANALISTA' } });
    assert.equal(created.status, 201);
    const { user, temporaryPassword } = await json<{ user: AdminUserDTO; temporaryPassword: string }>(created);
    const session = cookieOf(await t.api('POST', '/api/auth/login', { body: { username: 'pedro.analista', password: temporaryPassword } }));
    assert.equal((await t.api('GET', '/api/auth/me', { cookie: session })).status, 200);

    await t.api('PATCH', `/api/admin/users/${user.id}`, { cookie: admin, body: { isActive: false } });
    assert.equal((await t.api('GET', '/api/auth/me', { cookie: session })).status, 401);
    const relogin = await t.api('POST', '/api/auth/login', { body: { username: 'pedro.analista', password: temporaryPassword } });
    assert.equal(relogin.status, 403);
  });

  it('el tema valida contraste y formato del logo, se publica y queda auditado', async () => {
    const lowContrast = await t.api('PUT', '/api/admin/settings/theme', { cookie: admin, body: { ...DEFAULT_THEME, primary: '#f0f0f0' } });
    assert.equal(lowContrast.status, 400);

    const svgLogo = await t.api('PUT', '/api/admin/settings/theme', {
      cookie: admin,
      body: { ...DEFAULT_THEME, logoDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' },
    });
    assert.equal(svgLogo.status, 400, 'un SVG puede contener scripts: no se acepta');

    const ok = await t.api('PUT', '/api/admin/settings/theme', { cookie: admin, body: { ...DEFAULT_THEME, appName: 'Créditos GT', radius: 4 } });
    assert.equal(ok.status, 200);

    const pub = await json<{ theme: ThemeSettings }>(await t.api('GET', '/api/settings/theme'));
    assert.equal(pub.theme.appName, 'Créditos GT');
    assert.equal(pub.theme.radius, 4);

    const audit = t.c.adminAudit.list();
    assert.ok(audit.some((e) => e.action === 'APARIENCIA' && e.detail?.includes('radius: 12 → 4')));
    assert.throws(() => t.c.db.exec('DELETE FROM admin_audit'), /inmutable/);
  });
});
