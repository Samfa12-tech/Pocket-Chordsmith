# Godot UID And Cache Recovery

Godot can report unrecognized UID errors after moving, rebuilding, or replacing addon files. The addon should not depend on `.gd.uid` values, but project caches and scene references can still get stale.

Recommended clean rebuild:

1. Close Godot.
2. Back up the project.
3. Delete `.godot/uid_cache.bin` if present.
4. Delete stale addon `.gd.uid` files only if Godot keeps reporting those exact addon paths.
5. Reopen the project and let Godot rescan/import.
6. Open Project Settings and confirm addon/plugin autoload references point to paths, not stale missing scripts.
7. Run the project once from the editor.

For shippable addon scenes/resources, prefer explicit `res://addons/pocket_chordsmith/...` script paths and avoid hand-authored UID dependencies.

