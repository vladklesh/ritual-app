if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
if (S.train) screen = "train"; else if (S.run) screen = "run";
render();
