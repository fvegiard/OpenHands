---
name: update_test
description: ' | Triggers: /update_test'
license: MIT (plugin glue) / OpenHands LICENSE (upstream)
---

# update_test (openagent)

> Mavis-format port of openagent/OpenHands `skills/update_test.md`.
> Upstream: https://github.com/All-Hands-AI/OpenHands/blob/main/skills/update_test.md
> Triggers: /update_test

Can you check out branch "{{ BRANCH_NAME }}", and run {{ TEST_COMMAND_TO_RUN }}.

The current implementation of the code is correct BUT the test functions {{ FUNCTION_TO_FIX }} in file {{ FILE_FOR_FUNCTION }} are failing.

Please update the test file so that they pass with the current version of the implementation.

