# Vehicle source provenance

The runtime vehicle family is derived from Quaternius and KayKit assets released under CC0 1.0.
The checked-in source files make the conversion reproducible without a network request.

| Runtime kind | Upstream model | Source URL | SHA-256 |
| --- | --- | --- | --- |
| compact | Cars Pack, `Normal Car 2` | `https://static.poly.pizza/d35173c8-6078-4367-8f87-b1f2599f0bb7.glb` | `e5f5fa41c4434383b20287725c0e9d757cbd0f059eedc342ec265d32a195fe39` |
| sedan | Cars Pack, `Normal Car 1` | `https://static.poly.pizza/59a67a6c-490e-472e-bae6-5a4d2541f1c7.glb` | `bf00f2f0386a25aa310abc0424d22586e46a59ee6c737e6b375c97c9f01bd462` |
| SUV | Cars Pack, `SUV` | `https://static.poly.pizza/e5fbf2ee-5c9e-47d5-8ab6-80cacd463baa.glb` | `1a9ce2bba813dca5005abab09715b01b8b5f4a9c48d7260463afdfeb876aa8b6` |
| truck | Zombie Apocalypse Kit, `Vehicle_Truck` | `https://drive.usercontent.google.com/download?id=1Z-oz5wLLVso3NSs8jTIkVm8ysA4Lx7h1&export=download&confirm=t` | `44465d831e9220a7449a9e65fb277f0920d54588b6e9c610f7fdfda6e476456a` |
| traffic-compact | KayKit: City Builder Bits, `car_sedan` | `https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/tree/63976910ca04d16f0fc531b9c614244be8128713` | See source-set hashes below. |

KayKit source-set hashes at commit `63976910ca04d16f0fc531b9c614244be8128713`:

| File | SHA-256 |
| --- | --- |
| `car_sedan.gltf` | `96c9d38e682bc2c77470af09d1a7450208559ca652bf2cf6fd2bc20b8646ef59` |
| `car_sedan.bin` | `1d69e7f098a5456a8c6891c4fd718ad1c71397045c8931817550a8801f00338d` |
| `citybits_texture.png` | `6d2d9a5a13bce32209cd8c04572ab170504d68f34b1519165c9b0c41871e235b` |
| `LICENSE.txt` | `b076d86beec660e1550e00796ca24a8b70d7b2187d79954b2e29722b666dce93` |

License evidence:

- Quaternius Cars Pack: <https://quaternius.com/packs/cars.html> (CC0)
- Poly Pizza Cars Bundle mirror: <https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk> (Quaternius, CC0)
- Quaternius Zombie Apocalypse Kit: <https://quaternius.com/packs/zombieapocalypsekit.html> (CC0)
- KayKit: City Builder Bits: <https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0> (CC0)
- CC0 1.0 legal code: <https://creativecommons.org/publicdomain/zero/1.0/legalcode>

## Conversion

`npm run vehicles:prepare-family` rebuilds the Quaternius player vehicles, and
`npm run vehicles:prepare-traffic` rebuilds the KayKit traffic sedan. Both run Blender against
the checked-in sources. The scripts:

1. imports each upstream GLB/glTF;
2. rotates it to the simulator's local `-Z` forward convention;
3. scales it to the literal simulator collision dimensions and grounds it at zero;
4. preserves the authored body, glazing, trim, and wheel geometry;
5. names the paint, wheel, lamp, steering-wheel, and wiper handles required by the runtime contract;
6. exports a self-contained binary GLB to `public/models/vehicles/`.

Run `npm run vehicles:validate` after conversion. Runtime loading is strict: a missing file or handle is a visible initialization error, never a procedural fallback.
