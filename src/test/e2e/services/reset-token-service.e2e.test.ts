import dbInit from '../helpers/database-init';
import getLogger from '../../fixtures/no-logger';
import ResetTokenService from '../../../lib/services/reset-token-service';
import UserService from '../../../lib/services/user-service';
import { AccessService } from '../../../lib/services/access-service';
import NotFoundError from '../../../lib/error/notfound-error';
import { EmailService } from '../../../lib/services/email-service';
import User from '../../../lib/user';
import { IUnleashConfig } from '../../../lib/types/option';
import { createTestConfig } from '../../config/test-config';

const config: IUnleashConfig = createTestConfig();

let stores;
let db;
let adminUser;
let userToCreateResetFor: User;
let userIdToCreateResetFor: number;
let accessService: AccessService;
let userService: UserService;
let resetTokenService: ResetTokenService;

beforeAll(async () => {
    db = await dbInit('reset_token_service_serial', getLogger);
    stores = db.stores;
    accessService = new AccessService(stores, config);
    resetTokenService = new ResetTokenService(stores, config);

    const emailService = new EmailService(undefined, config.getLogger);

    userService = new UserService(stores, config, {
        accessService,
        resetTokenService,
        emailService,
    });

    adminUser = await userService.createUser({
        username: 'admin@test.com',
        rootRole: 1,
    });

    userToCreateResetFor = await userService.createUser({
        username: 'test@test.com',
        rootRole: 2,
    });
    userIdToCreateResetFor = userToCreateResetFor.id;
});

afterAll(async () => {
    if (db) {
        await db.destroy();
    }
});

test('Should create a reset link', async () => {
    const url = await resetTokenService.createResetPasswordUrl(
        userIdToCreateResetFor,
        adminUser,
    );

    expect(url.toString().indexOf('/reset-password') > 0).toBe(true);
});

test('Should create a welcome link', async () => {
    const url = await resetTokenService.createWelcomeUrl(
        userIdToCreateResetFor,
        adminUser.username,
    );
    expect(url.toString().indexOf('/new-user') > 0).toBe(true);
});

test('Tokens should be one-time only', async () => {
    const token = await resetTokenService.createToken(
        userIdToCreateResetFor,
        adminUser,
    );

    const accessGranted = await resetTokenService.useAccessToken(token);
    expect(accessGranted).toBe(true);
    const secondGo = await resetTokenService.useAccessToken(token);
    expect(secondGo).toBe(false);
});

test('Creating a new token should expire older tokens', async () => {
    const firstToken = await resetTokenService.createToken(
        userIdToCreateResetFor,
        adminUser,
    );
    const secondToken = await resetTokenService.createToken(
        userIdToCreateResetFor,
        adminUser,
    );
    await t.throwsAsync<NotFoundError>(async () =>
        resetTokenService.isValid(firstToken.token),
    );
    const validToken = await resetTokenService.isValid(secondToken.token);
    expect(secondToken.token).toBe(validToken.token);
});
