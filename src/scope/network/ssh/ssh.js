/** @flow */
import R from 'ramda';
import keyGetter from './key-getter';
import ComponentObjects from '../../component-objects';
import { RemoteScopeNotFound, NetworkError, UnexpectedNetworkError, PermissionDenied } from '../exceptions';
import { BitIds, BitId } from '../../../bit-id';
import { toBase64, fromBase64 } from '../../../utils';
import ComponentNotFound from '../../../scope/exceptions/component-not-found';
import type { SSHUrl } from '../../../utils/parse-ssh-url';
import type { ScopeDescriptor } from '../../scope';
import { unpack } from '../../../cli/cli-utils';
import ConsumerComponent from '../../../consumer/component';

const rejectNils = R.reject(R.isNil);
const sequest = require('sequest');

function absolutePath(path: string) {
  if (!path.startsWith('/')) return `~/${path}`;
  return path;
}

function clean(str: string) {
  return str.replace('\n', '');
}

function errorHandler(err, optionalId) {
  switch (err.code) {
    default:
      return new UnexpectedNetworkError();
    case 127:
      return new ComponentNotFound(err.id || optionalId);
    case 128:
      return new PermissionDenied();
    case 129:
      return new RemoteScopeNotFound();
    case 130:
      return new PermissionDenied();
  }
}

export type SSHProps = {
  path: string,
  username: string,
  port: number,
  host: string
};

export default class SSH {
  connection: any;
  path: string;
  username: string;
  port: number;
  host: string;

  constructor({ path, username, port, host }: SSHProps) {
    this.path = path;
    this.username = username;
    this.port = port;
    this.host = host || '';
  }

  buildCmd(commandName: string, ...args: string[]): string {
    function serialize() {
      return args
        .map(val => toBase64(val))
        .join(' ');
    }

    return `bit ${commandName} ${serialize()}`;
  }

  exec(commandName: string, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const cmd = this.buildCmd(commandName, absolutePath(this.path || ''), ...args);
      this.connection(cmd, function (err, res, o) {
        if (!o) return reject(new UnexpectedNetworkError());
        if (err && o.code && o.code !== 0) return reject(errorHandler(err, res));
        return resolve(clean(res));
      });
    });
  }

  push(componentObjects: ComponentObjects): Promise<ComponentObjects> {
    return this.exec('_put', componentObjects.toString())
      .then((str: string) => {
        try {
          return ComponentObjects.fromString(fromBase64(str));
        } catch (err) {
          throw new NetworkError(str);
        }
      });
  }

  describeScope(): Promise<ScopeDescriptor> {
    return this.exec('_scope')
      .then((data) => {
        return JSON.parse(fromBase64(data));
      })
      .catch(() => {
        throw new RemoteScopeNotFound();
      });
  }

  list() {
    return this.exec('_list')
    .then((str: string) => {
      const components = unpack(str);
      return rejectNils(components.map((c) => {
        return c ? ConsumerComponent.fromString(c) : null;
      }));
    });
  }

  search(query: string, reindex: boolean) {
    return this.exec('_search', query, reindex.toString()).then(JSON.parse);
  }

  show(id: BitId) {
    return this.exec('_show', id.toString())
    .then((str: string) => {
      const component = unpack(str);
      return str ? ConsumerComponent.fromString(component) : null;
    });
  }

  fetch(ids: BitIds, noDeps: bool = false): Promise<ComponentObjects[]> {
    let options = '';
    ids = ids.map(bitId => bitId.toString());
    if (noDeps) options = '-n';
    return this.exec(`_fetch ${options}`, ...ids)
      .then((str: string) => {
        const components = unpack(str);
        return components.map((raw) => {
          return ComponentObjects.fromString(raw);
        });
      });
  }

  close() {
    this.connection.end();
    return this;
  }

  composeConnectionUrl() {
    return `${this.username}@${this.host}:${this.port}`;
  }

  connect(sshUrl: SSHUrl, key: ?string): Promise<SSH> {
    return new Promise((resolve, reject) => {
      try {
        this.connection = sequest.connect(this.composeConnectionUrl(), {
          privateKey: keyGetter(key)
        });
      } catch (e) {
        return reject(e);
      }

      return resolve(this);
    });
  }
}
