# bgstack export

This package contains the scene specification and the files referenced by that scene.

## Run the demo

Serve this folder over HTTP(S), then open demo.html. Browsers generally block package fetches from file:// URLs.

The demo expects bgstack-runtime.js beside demo.html. The runtime was not available to the editor during export; copy your bgstack-runtime.js into this folder.

## Embed in an existing site

Load bgstack-runtime.js, create a canvas, then call:

    const bg = BgStack.create(document.querySelector('#bg'), { scale: 3, smooth: true, keys: false });
    await bg.loadPackage('./bgstack.json');
    bg.start();

The package manifest maps every exported sprite name to its image frames. The runtime resolves all paths relative to bgstack.json; it does not need a folder scan. 
