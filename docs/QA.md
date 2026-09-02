# Phone QA — demo scenarios

Run on the real number **+1 (934) 647-8409** and once via the `/call` web page. Keep the platform open on **Today** and **Calls** in two tabs. Tick each expectation; note timing and any wrong statement verbatim.

| # | Say | Expected agent behavior | Expected on screen |
|---|---|---|---|
| 1 | "Hi, my upstairs unit is frozen, I'm at 3284 Harborlight Hollow." | Reads back the address in Coral Gables, mentions last visit (July 27, Yvonne, drain line + safety switch) and the open callback tag; asks a triage question; offers 2 real windows with tech names; books after confirmation; reads back window + tech; asks about access | Calls: live row appears within 2 s, transcript grows, tool chips (find_address, get_address_dossier, find_availability, book_job). Today: new card slides in with "Agent" badge on the right tech and date |
| 2 | "This is Starfish Hospitality, ten two five four East Old Mangrove, unit thirty-six W. AC is out and we have guests checking in at four." | Recognizes multi-unit building, confirms unit 36W and the company; treats as high priority; offers the earliest same-day window; books; asks for gate/access info and says it will note it without repeating it | Job priority high on the card; booking note contains access info; event summary in activity strip |
| 3 | "It's the owner. What does my day look like?" | One-sentence summary (count, techs, in progress, unassigned, pending cancellations), then offers detail per tech | get_schedule tool chip; no writes |
| 4 | "This is Felix. What did we do last time at 103 Grouper Landing?" | Two-system install March 2, labor warranty until March 2, 2027, registered parts; last visit April 30 maintenance | Tool chips get_address_dossier / check_warranty |
| 5a | "Is it going to rain in Homestead this afternoon? I've got an attic job." | Weather sentence with temp + precipitation chance | get_weather chip |
| 5b | "What's the tonnage on a Trane 4TTR4036?" | 3-ton, from web search, one sentence | web_search chip |
| 6a | "I want to cancel my appointment on Thursday." (use the job booked in #1) | Finds the job, asks reason, explains the office will confirm, calls request_cancellation, does not claim it is canceled | Card turns striped red "Pending cancellation"; Inbox item with transcript excerpt; admin can approve → card gray |
| 6b | "I smell gas near the unit." | Safety instruction (leave, call gas company / 911), then transfer to office | Event call.transfer_attempted; if no answer → handoff task |
| 6c | "This invoice is wrong, I'm not paying that." | Does not argue or quote; offers transfer to the office; creates a callback task if transfer fails | Inbox handoff/callback task |
| 7 | Call back from the same phone after #1 | Greets by name, knows the site, skips identification | assistant-request variables used; call.identified event |
| 8 | Mumble an address that does not exist ("42 Nowhere Lane") | Says it cannot find it, asks to spell the street or give the name on the account; after 3 failures offers the office | not_found handled gracefully |

Latency: note the pause after each question. Target under ~1.5 s to first word after a tool call. Record p95 from Railway logs (`ms` field on tool-calls webhook).

After the session: open each call's detail page and confirm summary, outcome, promises and needs_review make sense (W3-A).
