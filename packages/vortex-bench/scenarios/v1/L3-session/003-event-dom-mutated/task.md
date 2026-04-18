You need to subscribe to DOM mutation events and verify they fire. Execute these steps IN ORDER:

1. Navigate the active tab to `{{FIXTURE_URL}}/smoke/basic-click` so the fixture page is loaded.
2. Call `vortex_events_subscribe` with `types=["dom.mutated"]` and `minLevel="info"`.
3. Call `vortex_dom_watch_mutations` on the (now-loaded) active tab to activate mutation reporting.
4. Click the Submit button on the page. This will mutate the DOM (changing the status text and URL).
5. Call `vortex_events_drain` to force-flush the dispatcher and pull any buffered events inline. This is required because the info-level aggregation window is 1s — without drain the events would not arrive before you finish.
6. In your final text, state whether at least one `dom.mutated` event was observed (from the drain return value).

Stop when done.
