'use strict';
// One reusable Python model process: avoids re-importing scikit-learn for every API request.
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
let processHandle = null;
let nextId = 0;
let pending = new Map();
let ready = false;
let generation = 0;

function rejectAll(message) {
  for (const item of pending.values()) {
    clearTimeout(item.timeout);
    item.reject(new Error(message));
  }
  pending.clear();
}

function start() {
  if (processHandle) return;
  const executable = process.env.COMPASS_PYTHON || 'python';
  const script = path.join(__dirname, 'sopDemoWorker.py');
  const worker = spawn(executable, [script], {
    cwd: path.join(__dirname, '..'),
    windowsHide: true,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const currentGeneration = ++generation;
  processHandle = worker;
  ready = false;
  worker.stdin.on('error', () => {});
  let errorText = '';
  worker.stderr.on('data', data => {
    errorText = (errorText + String(data)).slice(-1500);
  });
  const lines = readline.createInterface({input: worker.stdout});
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); }
    catch { return; }
    if (message.status === 'ready') {
      ready = true;
      console.log('Compass research Random Forest worker ready (models loaded).');
      return;
    }
    if (message.status === 'fatal') {
      console.error('Compass research model startup failed:', message.message, message.detail || '');
      return;
    }
    const job = pending.get(message.request_id);
    if (!job) return;
    pending.delete(message.request_id);
    clearTimeout(job.timeout);
    if (message.status === 'ok') job.resolve(message);
    else job.reject(new Error(message.message || 'Research prediction failed'));
  });
  const reset = message => {
    if (currentGeneration !== generation) return;
    processHandle = null;
    ready = false;
    console.error('Compass research worker:', message, errorText);
    rejectAll(message);
  };
  worker.on('error', error => reset(error.message));
  worker.on('close', code => reset('Python process stopped with code ' + code));
}

function predict(mode, date, counts = []) {
  start();
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(ready ? 'Model inference timed out' : 'Model startup timed out'));
      if (!ready && processHandle) processHandle.kill();
    }, 60000);
    pending.set(id, {resolve, reject, timeout});
    if (!processHandle || !processHandle.stdin.writable) {
      clearTimeout(timeout);
      pending.delete(id);
      reject(new Error('Python model worker unavailable'));
      return;
    }
    processHandle.stdin.write(JSON.stringify({request_id: id, mode, date, counts}) + '\n', err => {
      if (err && pending.has(id)) {
        clearTimeout(timeout);
        pending.delete(id);
        reject(err);
      }
    });
  });
}

// Start model import on server startup rather than when the customer clicks.
start();
module.exports = {predict};
