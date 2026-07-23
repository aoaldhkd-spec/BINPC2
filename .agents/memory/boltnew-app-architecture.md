---
name: boltnew-app architecture
description: Key structural decisions and gotchas in the boltnew-app artifact (Korean social networking app).
---

## Rule
`MainScreen` is a module-level function component (defined around line 4600 in App.tsx), NOT nested inside the `App()` function. State in `App()` that `MainScreen` needs must be passed as explicit props.

- `newMsgCount` / `setNewMsgCount` (useState) is declared in `App()` and passed down via `newMsgCount` and `onClearMsgCount` props.
- `buildAdminClient()` in AdminApp.tsx must have an explicit return type `SupabaseClient<Database>` annotation to prevent TypeScript from inferring a union type that breaks table typing.
- `GameState` (complex object) must be cast `as unknown as Json` when saving to `app_settings.game_state` column.
- `ContactShare` type is `Database["public"]["Tables"]["contact_shares"]["Row"]` which has `liker_id` (not `sender_id`) for the person who initiated the share.

**Why:** The subagent refactoring extracted MainScreen to module scope; state setters from App() are not available in MainScreen's closure.

**How to apply:** Before adding state that both App() and MainScreen need, add it to MainScreen's prop interface and pass it from App's <MainScreen> JSX.
