# Vehicle source provenance

The runtime vehicle family is derived from Quaternius assets released under CC0 1.0.
The checked-in source files make the conversion reproducible without a network request.

| Runtime kind | Upstream model | Source URL | SHA-256 |
| --- | --- | --- | --- |
| compact | Cars Pack, `Normal Car 2` | `https://static.poly.pizza/d35173c8-6078-4367-8f87-b1f2599f0bb7.glb` | `e5f5fa41c4434383b20287725c0e9d757cbd0f059eedc342ec265d32a195fe39` |
| sedan | Cars Pack, `Normal Car 1` | `https://static.poly.pizza/59a67a6c-490e-472e-bae6-5a4d2541f1c7.glb` | `bf00f2f0386a25aa310abc0424d22586e46a59ee6c737e6b375c97c9f01bd462` |
| SUV | Cars Pack, `SUV` | `https://static.poly.pizza/e5fbf2ee-5c9e-47d5-8ab6-80cacd463baa.glb` | `1a9ce2bba813dca5005abab09715b01b8b5f4a9c48d7260463afdfeb876aa8b6` |
| truck | Zombie Apocalypse Kit, `Vehicle_Truck` | `https://drive.usercontent.google.com/download?id=1Z-oz5wLLVso3NSs8jTIkVm8ysA4Lx7h1&export=download&confirm=t` | `44465d831e9220a7449a9e65fb277f0920d54588b6e9c610f7fdfda6e476456a` |

License evidence:

- Quaternius Cars Pack: <https://quaternius.com/packs/cars.html> (CC0)
- Poly Pizza Cars Bundle mirror: <https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk> (Quaternius, CC0)
- Quaternius Zombie Apocalypse Kit: <https://quaternius.com/packs/zombieapocalypsekit.html> (CC0)
- CC0 1.0 legal code: <https://creativecommons.org/publicdomain/zero/1.0/legalcode>

## Conversion

`npm run vehicles:prepare-family` runs Blender against the checked-in sources. The script:

1. imports each upstream GLB/glTF;
2. rotates it to the simulator's local `-Z` forward convention;
3. scales it to the literal simulator collision dimensions and grounds it at zero;
4. preserves the authored body, glazing, trim, and wheel geometry;
5. names the paint, wheel, lamp, steering-wheel, and wiper handles required by the runtime contract;
6. exports a self-contained binary GLB to `public/models/vehicles/`.

Run `npm run vehicles:validate` after conversion. Runtime loading is strict: a missing file or handle is a visible initialization error, never a procedural fallback.
