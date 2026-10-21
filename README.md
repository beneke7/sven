# Sven Bømwøllen in the browser

The same engine also runs offline in **Sven.app** on macOS. In the development
workspace, `python3 tools/build_native_mac.py` packages the verified site with a
small Swift AppKit/WebKit shell. `play.command` launches that edition;
`original-reference.command` keeps access to the unmodified executable in Wine.
The Mac shell has native pause/fullscreen menus and a separate atomic save for
scores, controls and progress, independent of its temporary loopback port.

A reconstructed JavaScript port using the original artwork, sounds and all 20
campaign maps. Gameplay runs directly in Canvas 2D and Web Audio. No executable,
Windows compatibility layer or CPU emulator runs in the browser. Exact parity
with the original game has not yet been verified; see [NOTICE.txt](NOTICE.txt).

Play with the arrow keys and Space. Escape pauses, S/F4 toggles sound, and B opens
the original boss screen. The setup screen supports both original key layouts
and custom bindings. Scores, controls and the continue level are saved in this
browser. Clearing site storage removes them.

Phones and tablets show a four-direction touch pad and an action button. Hold a
direction to move; hold AKTION to interact. Both work together with two fingers.
On menus the arrows select a button and OK activates it; the original menu
buttons also respond to taps. The footer pauses/resumes or returns to the menu.
Landscape puts the controls beside the original 4:3 field; portrait puts them
below it. Rotating the screen or leaving the tab pauses play and releases held
controls. High scores use the phone's normal keyboard. Fullscreen is offered
only where the browser supports it; controls stay available in fullscreen.

The published repository contains the static site. Serve it locally with:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080/`. The site also works below a path such as
`/sven/`; assets use relative URLs.

In the original development workspace, build and verify the site with:

```sh
python3 tools/build_native_web.py
python3 -m unittest discover -s tools -p test_classic_web_assets.py
node --test native-web/*.test.mjs native-web/tests/*.test.mjs
python3 -m http.server 8080 --directory build/sven-native-web
```

Building needs Python 3, Pillow and the supplied original Sven.exe, Sven.dat and
Score.dat. Their SHA-256 hashes are pinned by the importer. Node.js is needed for
the JavaScript tests. Optional original-instruction tests use the existing
Unicorn environment:

```sh
.tools/analysis/bin/python -m unittest discover -s tools -p test_special_binary_rules.py
.tools/analysis/bin/python native-web/binary-core.test.py
.tools/analysis/bin/python native-web/actors-binary.test.py
```

The builder copies only the native browser modules, these notices, generated
manifests and verified original assets into `build/sven-native-web`. It excludes
tests, analysis tools, private saves and earlier experimental builds. It never
modifies the publishing checkout's Git directory. `build.json` records release
hashes. Deploy the output to the separate `beneke7/sven` Pages repository after
local movement, interaction, campaign and browser checks pass; the existing
`beneke7.github.io` homepage is separate.
