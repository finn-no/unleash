import { LogProvider } from '../logger';

interface IExperimentalFlags {
    [key: string]: boolean;
}

export interface IUnleashConfig {
    getLogger: LogProvider;
    extendedPermissions?: boolean;
    experimental?: IExperimentalFlags;
    authentication: {
        enableApiToken: boolean;
    };
}

export enum AuthenticationType {
    none = 'none',
    unsecure = 'unsecure', // deprecated. Remove in v4
    custom = 'custom',
    openSource = 'open-source',
    enterprise = 'enterprise',
}
