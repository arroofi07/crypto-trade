process.on('message', (message) => {
  if (message === 'shutdown') {
    process.disconnect();
    process.emit('SIGINT');
  }
});
await import('../../apps/server/dist/main.js');
