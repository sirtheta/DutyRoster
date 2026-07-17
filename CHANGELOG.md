# Changelog

## [0.4.3](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.2...DutyRoster-v0.4.3) (2026-07-17)


### Features

* **auth:** self-service password reset via emailed link ([cd5d268](https://github.com/sirtheta/DutyRoster/commit/cd5d268b89b63bac7a4185e6738b88c24269cfee))
* **backup:** nightly SQLite backup via VACUUM INTO with configurable retention ([22d46c1](https://github.com/sirtheta/DutyRoster/commit/22d46c12fd6a7eb31a68c2dcb3141f4fb7a16637))
* **calendar:** highlight current day and scroll to it on load ([38eac6a](https://github.com/sirtheta/DutyRoster/commit/38eac6a8912283f22e823c4a80a2b2efa4e72f77))
* **calendar:** show uncovered weeks directly in the calendar view ([6d54a92](https://github.com/sirtheta/DutyRoster/commit/6d54a923e5dd5c10b18ec528b6a727ac2975b321))
* **dashboard:** duty overview with current, next, and uncovered weeks ([22848ac](https://github.com/sirtheta/DutyRoster/commit/22848acca456263158c47651ac561da4b5029477))
* **help:** add in-app setup guides for Telegram bot and chat ID ([4a017e3](https://github.com/sirtheta/DutyRoster/commit/4a017e349e407528c840471b6554b322e1a32bf6))
* **ical:** make Ferien inclusion in the iCal feed configurable per user ([#25](https://github.com/sirtheta/DutyRoster/issues/25)) ([33caeb1](https://github.com/sirtheta/DutyRoster/commit/33caeb16c47c40d33d81dfe8009e423c951e7f83))
* **notifications:** allow selecting Email and Telegram together, fix settings dialog UX ([0200eaf](https://github.com/sirtheta/DutyRoster/commit/0200eafa199adfa28517c0e2029a974bbe70873b))
* **rotation:** continue the rotation across year boundaries ([8f0d75c](https://github.com/sirtheta/DutyRoster/commit/8f0d75cd7babc3713ef570b5aac30f6ad233dafa))
* **rotation:** cover blocked weeks with the next available user and report uncovered weeks ([9c6f3ad](https://github.com/sirtheta/DutyRoster/commit/9c6f3ad89a2563fd8a881aaa6b290a161bb5a7ef))
* **settings:** show Telegram token status and add connection test ([00e985a](https://github.com/sirtheta/DutyRoster/commit/00e985a998f74204af3b0b58d9579cc3fae30a02))
* **swap:** duty swap requests between users ([df5735d](https://github.com/sirtheta/DutyRoster/commit/df5735dd2d2ecdfe49173e085874b807c5075e43))


### Bug Fixes

* **audit:** record affected cells in bulk entry audit logs ([276a895](https://github.com/sirtheta/DutyRoster/commit/276a8956cae6bf1b00fdc220f12de607a7919ae0))
* **calendar:** chunk bulk cell lookups to avoid the SQLite parameter limit ([9c8eaac](https://github.com/sirtheta/DutyRoster/commit/9c8eaac8daea161a1b47e9b4331e4dc2edc9f714))
* **calendar:** stick legend toolbar below app header, not behind it ([0a2cba9](https://github.com/sirtheta/DutyRoster/commit/0a2cba973c7d049cb3c537aa91af47ac7f4fc4d7))
* **email:** prevent mail clients from auto-linking dates in notification body ([d829fc8](https://github.com/sirtheta/DutyRoster/commit/d829fc821ea7fc2be2db309004aa91d28d5ed060))
* **notifications:** cap delivery retries and prune old notification/audit rows ([e6cb8af](https://github.com/sirtheta/DutyRoster/commit/e6cb8afc506c8a61b98fedc165c7e7e8247ce338))
* **notifications:** evaluate notify schedule in the app timezone ([3b9e39b](https://github.com/sirtheta/DutyRoster/commit/3b9e39b09337559b567d0c9139d4ee622d502f40))
* **notifications:** show Swiss date format and date range for duty week ([741db11](https://github.com/sirtheta/DutyRoster/commit/741db111ce22fa0a60bc717201c0e7e088fab555))

## [0.4.2](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.1...DutyRoster-v0.4.2) (2026-07-17)


### Features

* add version and copyright footer ([#20](https://github.com/sirtheta/DutyRoster/issues/20)) ([1a1c54f](https://github.com/sirtheta/DutyRoster/commit/1a1c54f1ef5d9fc7cb2bf376e6f2388cf6753904))
* **calendar:** add drag-to-select and per-user row tinting ([#23](https://github.com/sirtheta/DutyRoster/issues/23)) ([7d0460a](https://github.com/sirtheta/DutyRoster/commit/7d0460a716a567e2eaae03eed1ebdc398dc35d34))
* **settings:** add SMTP connection test button ([#22](https://github.com/sirtheta/DutyRoster/issues/22)) ([de110c9](https://github.com/sirtheta/DutyRoster/commit/de110c9b65cdefee0ed1cf38e70962c523030e05))
* **ui:** align design system with CustomerManagement ([262762c](https://github.com/sirtheta/DutyRoster/commit/262762c2e687acb90af6cfb45f68698d72794b13))
* **users:** add exit-date termination flow that preserves duty history ([#18](https://github.com/sirtheta/DutyRoster/issues/18)) ([616f890](https://github.com/sirtheta/DutyRoster/commit/616f890b8c1d701163b557c378eb59688c699688))
* **users:** implement rotation order insertion with automatic shifting ([#21](https://github.com/sirtheta/DutyRoster/issues/21)) ([80711fb](https://github.com/sirtheta/DutyRoster/commit/80711fb9ff9e8eed1e1dfac6cf9cd1a725fe3509))


### Bug Fixes

* **auth:** default session duration to 7 days ([6ff559c](https://github.com/sirtheta/DutyRoster/commit/6ff559cbb4ed0f5516d8923e8b3790020ce717f9))
* **auth:** default session duration to 7 days and UI improvements ([8aa9334](https://github.com/sirtheta/DutyRoster/commit/8aa9334adf96ee0d3c881e3298b59ec0bdbdb710))

## [0.4.1](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.4.0...DutyRoster-v0.4.1) (2026-07-16)


### Bug Fixes

* **auth:** refresh session name/email on periodic re-check ([8cef2a3](https://github.com/sirtheta/DutyRoster/commit/8cef2a3791d919defd1d512fcdbdd8c08d6e386a))
* **notifications:** let every user manage and test their own notification settings ([40d3b99](https://github.com/sirtheta/DutyRoster/commit/40d3b999d78fc0a3b4e5be88ec2204d6d65af5cd))

## [0.4.0](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.3.0...DutyRoster-v0.4.0) (2026-07-16)


### Features

* **calendar:** add realtime sync via SSE and harden concurrent duty moves ([1c7f6c3](https://github.com/sirtheta/DutyRoster/commit/1c7f6c3c8277241dc13ecbdd2ed1b3b26c25497d))


### Bug Fixes

* allow editor to move and edit other users planing (only S) ([0d69970](https://github.com/sirtheta/DutyRoster/commit/0d699707626e104e10f8a74c190f3d8f3bd0b3fa))
* **auth:** repair logout and add password visibility toggle + self-service change ([306989a](https://github.com/sirtheta/DutyRoster/commit/306989ad5234681d51276a77832a989e322ae306))
* **calendar:** stop legend toolbar from reflowing during cell selection ([5ed76bc](https://github.com/sirtheta/DutyRoster/commit/5ed76bcd9141b2a2a91fe5f429dbfbeec3306b8c))
* renaming ([50cfb5f](https://github.com/sirtheta/DutyRoster/commit/50cfb5f94bd77b38a2b28802b00be971f152c653))

## [0.3.0](https://github.com/sirtheta/DutyRoster/compare/DutyRoster-v0.2.0...DutyRoster-v0.3.0) (2026-07-16)


### Features

* **audit:** add admin audit-log page ([#7](https://github.com/sirtheta/DutyRoster/issues/7)) ([2603680](https://github.com/sirtheta/DutyRoster/commit/260368020d63b481080d96ecfc61c77a33d8d9bf))
* **calendar:** always show legend with click-to-paint categories ([3df9116](https://github.com/sirtheta/DutyRoster/commit/3df911689fb0d8fc543fb1fd2ffa12383ee6c01f))
* **calendar:** drag multiple selected cells together with live drop preview ([3623efe](https://github.com/sirtheta/DutyRoster/commit/3623efe09a46b05694f502c004c264dcefe22f97))
* **calendar:** show weekday abbreviation above each date ([ebaf5a0](https://github.com/sirtheta/DutyRoster/commit/ebaf5a00881e065f7807798f3bafdeaa89a71907))
* **holidays:** display dates in Swiss format (DD.MM.YYYY) ([22ce19f](https://github.com/sirtheta/DutyRoster/commit/22ce19f9efaead60998dcdb06e9ae5fd8c1e9af1))
* **holidays:** group consecutive holidays into ranges in list view ([d10ff9b](https://github.com/sirtheta/DutyRoster/commit/d10ff9b6227d178e91fc46d633c30eb88c34e502))
* **settings:** add devmode trigger to test email/Telegram notifications ([a671d39](https://github.com/sirtheta/DutyRoster/commit/a671d3990cf7c5a07f503abaf0235baf7f16bea8))
* **ui:** add mobile nav drawer and stacked-month calendar view ([04738ab](https://github.com/sirtheta/DutyRoster/commit/04738ab1bd1971d7d0976c287e7a0b3b1c059bf4))


### Bug Fixes

* **calendar:** support touch drag-and-drop for moving entries ([fcf1785](https://github.com/sirtheta/DutyRoster/commit/fcf17853072a51c1f19ed526192179ca2a5b8ddb))
* **dev:** allow LAN origins to reach the dev server ([9bc2e4a](https://github.com/sirtheta/DutyRoster/commit/9bc2e4a0d7e32902984df6592ecc324708093ae5))
* excel export ([46a29bf](https://github.com/sirtheta/DutyRoster/commit/46a29bf8c246f9e8ee7618bf7bc7799e598cadd9))
* **security:** remediate all findings from the security review  ([#6](https://github.com/sirtheta/DutyRoster/issues/6)) ([9c987fe](https://github.com/sirtheta/DutyRoster/commit/9c987fe16bfa1bdaa224482659333856d8024876))
* update dashboard chart ([bf86009](https://github.com/sirtheta/DutyRoster/commit/bf86009908678c0fd469bccadd40a08b5e9e11d2))

## [0.2.0](https://github.com/sirtheta/DutyRoster/compare/DutyRoster.web-vv0.1.0...DutyRoster.web-vv0.2.0) (2026-07-15)


### Features

* **calendar:** always show legend with click-to-paint categories ([3df9116](https://github.com/sirtheta/DutyRoster/commit/3df911689fb0d8fc543fb1fd2ffa12383ee6c01f))
* **calendar:** drag multiple selected cells together with live drop preview ([3623efe](https://github.com/sirtheta/DutyRoster/commit/3623efe09a46b05694f502c004c264dcefe22f97))
* **calendar:** show weekday abbreviation above each date ([ebaf5a0](https://github.com/sirtheta/DutyRoster/commit/ebaf5a00881e065f7807798f3bafdeaa89a71907))
* **holidays:** display dates in Swiss format (DD.MM.YYYY) ([22ce19f](https://github.com/sirtheta/DutyRoster/commit/22ce19f9efaead60998dcdb06e9ae5fd8c1e9af1))
* **holidays:** group consecutive holidays into ranges in list view ([d10ff9b](https://github.com/sirtheta/DutyRoster/commit/d10ff9b6227d178e91fc46d633c30eb88c34e502))
* **settings:** add devmode trigger to test email/Telegram notifications ([a671d39](https://github.com/sirtheta/DutyRoster/commit/a671d3990cf7c5a07f503abaf0235baf7f16bea8))
* **ui:** add mobile nav drawer and stacked-month calendar view ([04738ab](https://github.com/sirtheta/DutyRoster/commit/04738ab1bd1971d7d0976c287e7a0b3b1c059bf4))


### Bug Fixes

* **calendar:** support touch drag-and-drop for moving entries ([fcf1785](https://github.com/sirtheta/DutyRoster/commit/fcf17853072a51c1f19ed526192179ca2a5b8ddb))
* **dev:** allow LAN origins to reach the dev server ([9bc2e4a](https://github.com/sirtheta/DutyRoster/commit/9bc2e4a0d7e32902984df6592ecc324708093ae5))
* excel export ([46a29bf](https://github.com/sirtheta/DutyRoster/commit/46a29bf8c246f9e8ee7618bf7bc7799e598cadd9))
* update dashboard chart ([bf86009](https://github.com/sirtheta/DutyRoster/commit/bf86009908678c0fd469bccadd40a08b5e9e11d2))
