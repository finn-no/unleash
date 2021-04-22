const dbInit = require('../helpers/database-init');
const getLogger = require('../../fixtures/no-logger');
const ProjectService = require('../../../lib/services/project-service');
const {
    AccessService,
    RoleName,
} = require('../../../lib/services/access-service');
const User = require('../../../lib/user');
const { UPDATE_PROJECT } = require('../../../lib/permissions');
const NotFoundError = require('../../../lib/error/notfound-error');

let stores;
let db;

let projectService;
let accessService;
let user;

beforeAll(async () => {
    db = await dbInit('project_service_serial', getLogger);
    stores = db.stores;
    user = await stores.userStore.insert(
        new User({ name: 'Some Name', email: 'test@getunleash.io' }),
    );
    const config = { getLogger, experimental: { rbac: true } };
    accessService = new AccessService(stores, config);
    projectService = new ProjectService(stores, config, accessService);
});

afterAll(async () => {
    await db.destroy();
});

test('should have default project', async () => {
    const project = await projectService.getProject('default');
    t.assert(project);
    expect(project.id).toBe('default');
});

test('should list all projects', async () => {
    const project = {
        id: 'test-list',
        name: 'New project',
        description: 'Blah',
    };

    await projectService.createProject(project, user);
    const projects = await projectService.getProjects();
    expect(projects.length).toBe(2);
});

test('should create new project', async () => {
    const project = {
        id: 'test',
        name: 'New project',
        description: 'Blah',
    };

    await projectService.createProject(project, user);
    const ret = await projectService.getProject('test');
    expect(project.id).toEqual(ret.id);
    expect(project.name).toEqual(ret.name);
    expect(project.description).toEqual(ret.description);
    expect(ret.createdAt).toBeTruthy();
});

test('should delete project', async () => {
    const project = {
        id: 'test-delete',
        name: 'New project',
        description: 'Blah',
    };

    await projectService.createProject(project, user);
    await projectService.deleteProject(project.id, user);

    try {
        await projectService.getProject(project.id);
    } catch (err) {
        expect(err.message).toBe('No project found');
    }
});

test('should not be able to delete project with toggles', async () => {
    const project = {
        id: 'test-delete-with-toggles',
        name: 'New project',
        description: 'Blah',
    };
    await projectService.createProject(project, user);
    await stores.featureToggleStore.createFeature({
        name: 'test-project-delete',
        project: project.id,
        enabled: false,
    });

    try {
        await projectService.deleteProject(project.id, user);
    } catch (err) {
        expect(err.message).toBe('You can not delete as project with active feature toggles');
    }
});

test('should not delete "default" project', async () => {
    try {
        await projectService.deleteProject('default', user);
    } catch (err) {
        expect(err.message).toBe('You can not delete the default project!');
    }
});

test('should validate name, legal', async () => {
    const result = await projectService.validateId('new_name');
    expect(result).toBe(true);
});

test('should not be able to create exiting project', async () => {
    const project = {
        id: 'test-delete',
        name: 'New project',
        description: 'Blah',
    };
    try {
        await projectService.createProject(project, user);
        await projectService.createProject(project, user);
    } catch (err) {
        expect(err.message).toBe('A project with this id already exists.');
    }
});

test('should require URL friendly ID', async () => {
    try {
        await projectService.validateId('new name øæå');
    } catch (err) {
        expect(err.message).toBe('"value" must be URL friendly');
    }
});

test('should require unique ID', async () => {
    try {
        await projectService.validateId('default');
    } catch (err) {
        expect(err.message).toBe('A project with this id already exists.');
    }
});

test('should update project', async () => {
    const project = {
        id: 'test-update',
        name: 'New project',
        description: 'Blah',
    };

    const updatedProject = {
        id: 'test-update',
        name: 'New name',
        description: 'Blah longer desc',
    };

    await projectService.createProject(project, user);
    await projectService.updateProject(updatedProject, user);

    const readProject = await projectService.getProject(project.id);

    expect(updatedProject.name).toBe(readProject.name);
    expect(updatedProject.description).toBe(readProject.description);
});

test('should give error when getting unknown project', async () => {
    try {
        await projectService.getProject('unknown');
    } catch (err) {
        expect(err.message).toBe('No project found');
    }
});

test(
    '(TODO: v4): should create roles for new project if userId is missing',
    async () => {
        const project = {
            id: 'test-roles-no-id',
            name: 'New project',
            description: 'Blah',
        };
        await projectService.createProject(project, {
            username: 'random-user',
        });
        const roles = await stores.accessStore.getRolesForProject(project.id);

        expect(roles.length).toBe(2);
        expect(await accessService.hasPermission(user, UPDATE_PROJECT, project.id)).toBe(false);
    }
);

test('should create roles when project is created', async () => {
    const project = {
        id: 'test-roles',
        name: 'New project',
        description: 'Blah',
    };
    await projectService.createProject(project, user);
    const roles = await stores.accessStore.getRolesForProject(project.id);
    expect(roles.length).toBe(2);
    expect(await accessService.hasPermission(user, UPDATE_PROJECT, project.id)).toBe(true);
});

test('should get list of users with access to project', async () => {
    const project = {
        id: 'test-roles-access',
        name: 'New project',
        description: 'Blah',
    };
    await projectService.createProject(project, user);
    const { roles, users } = await projectService.getUsersWithAccess(
        project.id,
        user,
    );

    const owner = roles.find(role => role.name === RoleName.OWNER);
    const member = roles.find(role => role.name === RoleName.MEMBER);

    expect(users.length).toBe(1);
    expect(users[0].id).toBe(user.id);
    expect(users[0].name).toBe(user.name);
    expect(users[0].roleId).toBe(owner.id);
    expect(member).toBeTruthy();
});

test('should add a member user to the project', async () => {
    const project = {
        id: 'add-users',
        name: 'New project',
        description: 'Blah',
    };
    await projectService.createProject(project, user);

    const projectMember1 = await stores.userStore.insert(
        new User({ name: 'Some Member', email: 'member1@getunleash.io' }),
    );
    const projectMember2 = await stores.userStore.insert(
        new User({ name: 'Some Member 2', email: 'member2@getunleash.io' }),
    );

    const roles = await stores.accessStore.getRolesForProject(project.id);
    const memberRole = roles.find(r => r.name === RoleName.MEMBER);

    await projectService.addUser(project.id, memberRole.id, projectMember1.id);
    await projectService.addUser(project.id, memberRole.id, projectMember2.id);

    const { users } = await projectService.getUsersWithAccess(project.id, user);
    const memberUsers = users.filter(u => u.roleId === memberRole.id);

    expect(memberUsers.length).toBe(2);
    expect(memberUsers[0].id).toBe(projectMember1.id);
    expect(memberUsers[0].name).toBe(projectMember1.name);
    expect(memberUsers[1].id).toBe(projectMember2.id);
    expect(memberUsers[1].name).toBe(projectMember2.name);
});

test('should add admin users to the project', async () => {
    const project = {
        id: 'add-admin-users',
        name: 'New project',
        description: 'Blah',
    };
    await projectService.createProject(project, user);

    const projectAdmin1 = await stores.userStore.insert(
        new User({ name: 'Some Member', email: 'admin1@getunleash.io' }),
    );
    const projectAdmin2 = await stores.userStore.insert(
        new User({ name: 'Some Member 2', email: 'admin2@getunleash.io' }),
    );

    const projectRoles = await stores.accessStore.getRolesForProject(
        project.id,
    );
    const ownerRole = projectRoles.find(r => r.name === RoleName.OWNER);

    await projectService.addUser(project.id, ownerRole.id, projectAdmin1.id);
    await projectService.addUser(project.id, ownerRole.id, projectAdmin2.id);

    const { users } = await projectService.getUsersWithAccess(project.id, user);

    const adminUsers = users.filter(u => u.roleId === ownerRole.id);

    expect(adminUsers.length).toBe(3);
    expect(adminUsers[1].id).toBe(projectAdmin1.id);
    expect(adminUsers[1].name).toBe(projectAdmin1.name);
    expect(adminUsers[2].id).toBe(projectAdmin2.id);
    expect(adminUsers[2].name).toBe(projectAdmin2.name);
});

test('add user only accept to add users to project roles', async () => {
    const roles = await accessService.getRoles();
    const memberRole = roles.find(r => r.name === RoleName.MEMBER);

    await t.throwsAsync(
        async () => {
            await projectService.addUser('some-id', memberRole.id, user.id);
        },
        {
            instanceOf: NotFoundError,
            message: /Could not find roleId=\d+ on project=some-id/,
        },
    );
});

test('add user should fail if user already have access', async () => {
    const project = {
        id: 'add-users-twice',
        name: 'New project',
        description: 'Blah',
    };
    await projectService.createProject(project, user);

    const projectMember1 = await stores.userStore.insert(
        new User({ name: 'Some Member', email: 'member42@getunleash.io' }),
    );

    const roles = await stores.accessStore.getRolesForProject(project.id);
    const memberRole = roles.find(r => r.name === RoleName.MEMBER);

    await projectService.addUser(project.id, memberRole.id, projectMember1.id);

    await t.throwsAsync(
        async () => {
            await projectService.addUser(
                project.id,
                memberRole.id,
                projectMember1.id,
            );
        },
        {
            instanceOf: Error,
            message: 'User already have access to project=add-users-twice',
        },
    );
});

test('should remove user from the project', async () => {
    const project = {
        id: 'remove-users',
        name: 'New project',
        description: 'Blah',
    };
    await projectService.createProject(project, user);

    const projectMember1 = await stores.userStore.insert(
        new User({ name: 'Some Member', email: 'member99@getunleash.io' }),
    );

    const roles = await stores.accessStore.getRolesForProject(project.id);
    const memberRole = roles.find(r => r.name === RoleName.MEMBER);

    await projectService.addUser(project.id, memberRole.id, projectMember1.id);
    await projectService.removeUser(
        project.id,
        memberRole.id,
        projectMember1.id,
    );

    const { users } = await projectService.getUsersWithAccess(project.id, user);
    const memberUsers = users.filter(u => u.roleId === memberRole.id);

    expect(memberUsers.length).toBe(0);
});
