import { URL } from 'url';
import dbInit from '../../helpers/database-init';
import getLogger from '../../../fixtures/no-logger';

import {
    AccessService,
    RoleName,
} from '../../../../lib/services/access-service';
import ResetTokenService from '../../../../lib/services/reset-token-service';
import UserService from '../../../../lib/services/user-service';
import { setupApp } from '../../helpers/test-helper';
import { EmailService } from '../../../../lib/services/email-service';
import User from '../../../../lib/user';
import { IUnleashConfig } from '../../../../lib/types/option';
import { createTestConfig } from '../../../config/test-config';

let stores;
let db;
const config: IUnleashConfig = createTestConfig({
    getLogger,
    server: {
        unleashUrl: 'http://localhost:3000',
        baseUriPath: '',
    },
    email: {
        host: 'test',
    },
});
const password = 'DtUYwi&l5I1KX4@Le';
let userService: UserService;
let accessService: AccessService;
let resetTokenService: ResetTokenService;
let adminUser: User;
let user: User;

const getBackendResetUrl = (url: URL): string => {
    const urlString = url.toString();

    const params = urlString.substring(urlString.indexOf('?'));
    return `/auth/reset/validate${params}`;
};

beforeAll(async () => {
    db = await dbInit('reset_password_api_serial', getLogger);
    stores = db.stores;
    accessService = new AccessService(stores, config);
    const emailService = new EmailService(config.email, config.getLogger);

    userService = new UserService(stores, config, {
        accessService,
        resetTokenService,
        emailService,
    });
    resetTokenService = new ResetTokenService(stores, config);
    const adminRole = await accessService.getRootRole(RoleName.ADMIN);
    adminUser = await userService.createUser({
        username: 'admin@test.com',
        rootRole: adminRole.id,
    });

    const userRole = await accessService.getRootRole(RoleName.EDITOR);
    user = await userService.createUser({
        username: 'test@test.com',
        email: 'test@test.com',
        rootRole: userRole.id,
    });
});

test(async () => {
    await stores.resetTokenStore.deleteAll();
});

afterAll(async () => {
    await db.destroy();
});

test('Can validate token for password reset', async () => {
    const request = await setupApp(stores);
    const url = await resetTokenService.createResetPasswordUrl(
        user.id,
        adminUser.username,
    );
    const relative = getBackendResetUrl(url);
    return request
        .get(relative)
        .expect(200)
        .expect('Content-Type', /json/)
        .expect(res => {
            expect(res.body.email).toBe(user.email);
        });
});

test('Can use token to reset password', async () => {
    const request = await setupApp(stores);
    const url = await resetTokenService.createResetPasswordUrl(
        user.id,
        adminUser.username,
    );
    const relative = getBackendResetUrl(url);
    // Can't login before reset
    t.throwsAsync<Error>(
        async () => userService.loginUser(user.email, password),
        {
            instanceOf: Error,
        },
    );

    let token;
    await request
        .get(relative)
        .expect(200)
        .expect('Content-Type', /json/)
        .expect(res => {
            token = res.body.token;
        });
    await request
        .post('/auth/reset/password')
        .send({
            token,
            password,
        })
        .expect(200);
    const loggedInUser = await userService.loginUser(user.email, password);
    expect(user.email).toBe(loggedInUser.email);
});

test(
    'Trying to reset password with same token twice does not work',
    async () => {
        const request = await setupApp(stores);
        const url = await resetTokenService.createResetPasswordUrl(
            user.id,
            adminUser.username,
        );
        const relative = getBackendResetUrl(url);
        let token;
        await request
            .get(relative)
            .expect(200)
            .expect('Content-Type', /json/)
            .expect(res => {
                token = res.body.token;
            });
        await request
            .post('/auth/reset/password')
            .send({
                email: user.email,
                token,
                password,
            })
            .expect(200);
        await request
            .post('/auth/reset/password')
            .send({
                email: user.email,
                token,
                password,
            })
            .expect(403)
            .expect(res => {
                expect(res.body.details[0].message).toBeTruthy();
            });
    }
);

test('Invalid token should yield 401', async () => {
    const request = await setupApp(stores);
    return request.get('/auth/reset/validate?token=abc123').expect(res => {
        expect(res.status).toBe(401);
    });
});

test(
    'Trying to change password with an invalid token should yield 401',
    async () => {
        const request = await setupApp(stores);
        return request
            .post('/auth/reset/password')
            .send({
                token: 'abc123',
                password,
            })
            .expect(res => expect(res.status).toBe(401));
    }
);