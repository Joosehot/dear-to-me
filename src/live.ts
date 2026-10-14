// The live channel: one WebSocket for the signed-in user, events to whoever listens.

import { useEffect } from 'react';
import type { ClientEvent, ServerEvent } from '../shared/types';
import { MOCK, currentUser } from './api';
import { mockLive } from './mock';

type Listener = (e: ServerEvent) => void;

let socket: WebSocket | null = null;
let queue: ClientEvent[] = [];
const listeners = new Set<Listener>();
const joined = new Set<string>();

function connect() {
  if (MOCK) {
    mockLive.listen((e) => {
      for (const l of listeners) l(e);
    });
    return;
  }
  if (!currentUser() || socket) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // signed in by the session cookie, which the browser sends with the upgrade
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;
  ws.onopen = () => {
    // after a reconnect, be back in the conversations this tab was in
    for (const postId of joined) ws.send(JSON.stringify({ type: 'join', postId } satisfies ClientEvent));
    for (const e of queue) ws.send(JSON.stringify(e));
    queue = [];
  };
  ws.onmessage = (m) => {
    const e = JSON.parse(m.data) as ServerEvent;
    for (const l of listeners) l(e);
  };
  ws.onclose = (e) => {
    if (socket === ws) socket = null;
    // 4001: not signed in (any more); trying again would not change that
    if (e.code !== 4001 && currentUser()) setTimeout(connect, 1500);
  };
}

export function emit(e: ClientEvent) {
  if (e.type === 'join') joined.add(e.postId);
  if (e.type === 'leave') joined.delete(e.postId);
  connect();
  if (MOCK) return mockLive.emit(e);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(e));
  else if (e.type === 'say') queue.push(e);
}

export function disconnect() {
  if (MOCK) mockLive.stop();
  joined.clear();
  socket?.close();
  socket = null;
}

/** Listen to the live channel; `on` false (a visitor who is not signed in): no socket at all. */
export function useLive(listener: Listener, on = true) {
  useEffect(() => {
    if (!on) return;
    connect();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [listener, on]);
}
