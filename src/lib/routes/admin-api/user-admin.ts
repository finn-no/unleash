import Controller from '../controller';
import { ADMIN } from '../../permissions';
import { IUnleashConfig } from '../../types/core';
import UserService from '../../services/user-service';
import { AccessService, RoleName } from '../../services/access-service';
import { Logger } from '../../logger';

class UserAdminController extends Controller {
    private userService: UserService;

    private accessService: AccessService;

    private logger: Logger;

    constructor(config: IUnleashConfig, { userService, accessService }) {
        super(config);
        this.userService = userService;
        this.accessService = accessService;
        this.logger = config.getLogger('routes/user-controller.js');

        this.get('/', this.getUsers);
        this.get('/search', this.search);
        this.post('/', this.createUser, ADMIN);
        this.post('/validate-password', this.validatePassword);
        this.put('/:id', this.updateUser, ADMIN);
        this.post('/:id/change-password', this.changePassword, ADMIN);
        this.delete('/:id', this.deleteUser, ADMIN);
    }

    private validateRootRole(roleName) {
        if (!Object.values(RoleName).includes(roleName)) {
            throw new Error(`Unknown rootRole = ${roleName}`);
        }
    }

    async getUsers(req, res) {
        try {
            const users = await this.userService.getAll();
            const rootRoles = await this.accessService.getRootRolesForAllUsers();

            const usersWithRootRole = users.map(u => {
                const rootRole = rootRoles.find(r => r.userId === u.id);
                const rootRoleName =
                    rootRole && rootRole.roles.length > 0
                        ? rootRole.roles[0].name
                        : RoleName.READ;
                return { ...u, rootRole: rootRoleName };
            });

            res.json({ users: usersWithRootRole });
        } catch (error) {
            this.logger.error(error);
            res.status(500).send({ msg: 'server errors' });
        }
    }

    async search(req, res) {
        const { q } = req.query;
        try {
            const users =
                q && q.length > 1 ? await this.userService.search(q) : [];
            res.json(users);
        } catch (error) {
            this.logger.error(error);
            res.status(500).send({ msg: 'server errors' });
        }
    }

    async createUser(req, res) {
        const { username, email, name, rootRole = 'Regular' } = req.body;

        try {
            this.validateRootRole(rootRole);

            const user = await this.userService.createUser({
                username,
                email,
                name,
                rootRole,
            });
            res.status(201).send({ ...user, rootRole });
        } catch (e) {
            this.logger.warn(e.message);
            res.status(400).send([{ msg: e.message }]);
        }
    }

    async updateUser(req, res) {
        const { id } = req.params;
        const { name, email, rootRole = 'Regular' } = req.body;

        this.validateRootRole(rootRole);

        try {
            const user = await this.userService.updateUser({
                id: Number(id),
                name,
                email,
                rootRole,
            });
            res.status(200).send({ ...user, rootRole });
        } catch (e) {
            this.logger.warn(e.message);
            res.status(400).send([{ msg: e.message }]);
        }
    }

    async deleteUser(req, res) {
        const { id } = req.params;

        try {
            await this.userService.deleteUser(+id);
            res.status(200).send();
        } catch (error) {
            this.logger.warn(error);
            res.status(500).send();
        }
    }

    async validatePassword(req, res) {
        const { password } = req.body;

        try {
            this.userService.validatePassword(password);
            res.status(200).send();
        } catch (e) {
            res.status(400).send([{ msg: e.message }]);
        }
    }

    async changePassword(req, res) {
        const { id } = req.params;
        const { password } = req.body;

        try {
            await this.userService.changePassword(+id, password);
            res.status(200).send();
        } catch (e) {
            res.status(400).send([{ msg: e.message }]);
        }
    }
}

module.exports = UserAdminController;
