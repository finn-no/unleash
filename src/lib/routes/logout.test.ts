import supertest from 'supertest';
import express from 'express';
import { createTestConfig } from '../../test/config/test-config';

import LogoutController from './logout';
import { IAuthRequest } from './unleash-types';

test('should redirect to "/" after logout', async () => {
    const baseUriPath = '';
    const app = express();
    const config = createTestConfig({ server: { baseUriPath } });
    app.use('/logout', new LogoutController(config).router);
    const request = supertest(app);
    expect.assertions(0);
    await request
        .get(`${baseUriPath}/logout`)
        .expect(302)
        .expect('Location', `${baseUriPath}/`);
});

test('should redirect to "/basePath" after logout when baseUriPath is set', async () => {
    const baseUriPath = '/basePath';
    const app = express();
    const config = createTestConfig({ server: { baseUriPath } });
    app.use('/logout', new LogoutController(config).router);
    const request = supertest(app);
    expect.assertions(0);
    await request
        .get(`/logout`)
        .expect(302)
        .expect('Location', `${baseUriPath}/`);
});

test('should set "Clear-Site-Data" header', async () => {
    const baseUriPath = '';
    const app = express();
    const config = createTestConfig({ server: { baseUriPath } });
    app.use('/logout', new LogoutController(config).router);
    const request = supertest(app);
    expect.assertions(0);
    await request
        .get(`${baseUriPath}/logout`)
        .expect(302)
        .expect('Clear-Site-Data', '"cookies", "storage"');
});

test('should call destroy on session', async () => {
    const baseUriPath = '';
    const fakeSession = {
        destroy: jest.fn(),
    };
    const app = express();
    const config = createTestConfig({ server: { baseUriPath } });
    app.use((req: IAuthRequest, res, next) => {
        req.session = fakeSession;
        next();
    });
    app.use('/logout', new LogoutController(config).router);
    const request = supertest(app);
    await request.get(`${baseUriPath}/logout`);

    expect(fakeSession.destroy.mock.calls.length).toBe(1);
});

test('should redirect to alternative logoutUrl', async () => {
    const fakeSession = {
        destroy: jest.fn(),
        logoutUrl: '/some-other-path',
    };
    const app = express();
    const config = createTestConfig();
    app.use((req: IAuthRequest, res, next) => {
        req.session = fakeSession;
        next();
    });
    app.use('/logout', new LogoutController(config).router);
    const request = supertest(app);
    await request
        .get(`/logout`)
        .expect(302)
        .expect('Location', '/some-other-path');
});
