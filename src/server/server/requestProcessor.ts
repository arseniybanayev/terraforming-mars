import * as http from 'http';
import {paths} from '../../common/app/paths';

import {ApiCloneableGame} from '../routes/ApiCloneableGame';
import {ApiGameLogs} from '../routes/ApiGameLogs';
import {ApiGames} from '../routes/ApiGames';
import {ApiGame} from '../routes/ApiGame';
import {ApiGameHistory} from '../routes/ApiGameHistory';
import {ApiPlayer} from '../routes/ApiPlayer';
import {ApiStats} from '../routes/ApiStats';
import {ApiMetrics} from '../routes/ApiMetrics';
import {ApiSpectator} from '../routes/ApiSpectator';
import {ApiWaitingFor} from '../routes/ApiWaitingFor';
import {GameHandler} from '../routes/Game';
import {GameLoader} from '../database/GameLoader';
import {GamesOverview} from '../routes/GamesOverview';
import {Context, IHandler} from '../routes/IHandler';
import {Load} from '../routes/Load';
import {LoadGame} from '../routes/LoadGame';
import {Route} from '../routes/Route';
import {PlayerInput} from '../routes/PlayerInput';
import {ServeApp} from '../routes/ServeApp';
import {ServeAsset} from '../routes/ServeAsset';
import {serverId, statsId} from '../utils/server-ids';
import {Reset} from '../routes/Reset';
import {newIpBlocklist} from './IPBlocklist';
import {ApiIPs} from '../routes/ApiIPs';
import {newIpTracker} from './IPTracker';
import {getHerokuIpAddress} from './heroku';

const ips = (process.env.IP_BLOCKLIST ?? '').trim().split(' ');
const ipBlocklist = newIpBlocklist(ips);
const ipTracker = newIpTracker();

const handlers: Map<string, IHandler> = new Map(
  [
    ['', ServeApp.INSTANCE],
    [paths.ADMIN, ServeApp.INSTANCE],
    [paths.API_CLONEABLEGAME, ApiCloneableGame.INSTANCE],
    [paths.API_GAME, ApiGame.INSTANCE],
    [paths.API_GAME_HISTORY, ApiGameHistory.INSTANCE],
    [paths.API_GAME_LOGS, ApiGameLogs.INSTANCE],
    [paths.API_GAMES, ApiGames.INSTANCE],
    [paths.API_IPS, ApiIPs.INSTANCE],
    [paths.API_METRICS, ApiMetrics.INSTANCE],
    [paths.API_PLAYER, ApiPlayer.INSTANCE],
    [paths.API_STATS, ApiStats.INSTANCE],
    [paths.API_SPECTATOR, ApiSpectator.INSTANCE],
    [paths.API_WAITING_FOR, ApiWaitingFor.INSTANCE],
    [paths.CARDS, ServeApp.INSTANCE],
    ['favicon.ico', ServeAsset.INSTANCE],
    [paths.GAME, GameHandler.INSTANCE],
    [paths.GAMES_OVERVIEW, GamesOverview.INSTANCE],
    [paths.HELP, ServeApp.INSTANCE],
    [paths.LOAD, Load.INSTANCE],
    [paths.LOAD_GAME, LoadGame.INSTANCE],
    ['main.js', ServeAsset.INSTANCE],
    ['main.js.map', ServeAsset.INSTANCE],
    [paths.NEW_GAME, ServeApp.INSTANCE],
    [paths.PLAYER, ServeApp.INSTANCE],
    [paths.PLAYER_INPUT, PlayerInput.INSTANCE],
    [paths.RESET, Reset.INSTANCE],
    [paths.SPECTATOR, ServeApp.INSTANCE],
    ['styles.css', ServeAsset.INSTANCE],
    ['sw.js', ServeAsset.INSTANCE],
    [paths.THE_END, ServeApp.INSTANCE],
  ],
);

function getIPAddress(req: http.IncomingMessage): string {
  const herokuIpAddress = getHerokuIpAddress(req);
  if (herokuIpAddress !== undefined) {
    return herokuIpAddress;
  }
  const socketIpAddress = req.socket.address();
  if (typeof socketIpAddress === 'object') {
    return '!' + socketIpAddress.address + '!';
  }
  return socketIpAddress;
}

export function processRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  route: Route): void {
  const ipAddress = getIPAddress(req);
  ipTracker.add(ipAddress);
  if (ipBlocklist.isBlocked(ipAddress)) {
    route.notFound(req, res);
  }

  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  if (req.url === undefined) {
    route.notFound(req, res);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.substring(1); // Remove leading '/'
  const ctx: Context = {
    url: url,
    route: route,
    gameLoader: GameLoader.getInstance(),
    ip: getIPAddress(req),
    ipTracker: ipTracker,
    ids: {
      serverId,
      statsId,
    }};

  const handler: IHandler | undefined = handlers.get(pathname);

  if (handler !== undefined) {
    handler.processRequest(req, res, ctx);
  } else if (req.method === 'GET' && pathname.startsWith('assets/')) {
    ServeAsset.INSTANCE.get(req, res, ctx);
  } else {
    route.notFound(req, res);
  }
}
