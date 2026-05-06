const start = Date.now();
setInterval(() => {
    console.log(`Event loop tick: ${Date.now() - start}ms`);
}, 1000);
