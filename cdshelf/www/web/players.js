// Labels use Music Assistant metadata, never assumptions about the browsing device.
const PROTOCOLS = {airplay:'AirPlay',chromecast:'Google Cast',dlna:'DLNA / UPnP',upnp:'UPnP',sonos:'Sonos',sonos_s1:'Sonos S1',homeassistant:'Home Assistant',slimproto:'Squeezebox',snapcast:'Snapcast',sendspin:'Sendspin',universal_player:'Universal player',onkyo:'Onkyo'};
export const playerName = player => player?.display_name || player?.name || player?.player_id || 'Unknown device';
const domainName = domain => PROTOCOLS[domain] || domain?.replaceAll('_',' ') || '';
export function playerProtocol(player) {
  const outputs = player.output_protocols || [];
  const active = outputs.find(output => output.output_protocol_id === player.active_output_protocol);
  if (active) return active.name || domainName(active.protocol_domain);
  const domain = (player.provider || '').split('--')[0];
  return domainName(domain) || 'Connection unspecified';
}
export function mergePlayerNames(players, configs) {
  const names = new Map((Array.isArray(configs) ? configs : []).filter(c => c?.player_id).map(c => [c.player_id,c]));
  return players.map(player => {
    const config = names.get(player.player_id);
    // The saved custom name takes precedence over a stale/default runtime name.
    const display_name = config?.name || player.display_name || player.name || config?.default_name || player.player_id;
    return {...player, display_name};
  });
}
export function playerLabels(players) {
  const labels = players.map(player => `${playerName(player)} — ${playerProtocol(player)}`);
  return labels.map((label,index) => `${label}${labels.filter(other => other === label).length > 1 ? ` [${players[index].player_id}]` : ''}${players[index].available === false ? ' · unavailable' : ''}`);
}
