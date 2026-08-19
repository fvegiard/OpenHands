---
name: fix_test
description: ' | Triggers: /fix_test'
license: MIT (plugin glue) / OpenHands LICENSE (upstream)
---

# fix_test (openagent)

> Mavis-format port of openagent/OpenHands `skills/fix_test.md`.
> Upstream: https://github.com/All-Hands-AI/OpenHands/blob/main/skills/fix_test.md
> Triggers: /fix_test

Can you check out branch "{{ BRANCH_NAME }}", and run {{ TEST_COMMAND_TO_RUN }}.

Help me fix these tests to pass by fixing the {{ FUNCTION_TO_FIX }} function in file {{ FILE_FOR_FUNCTION }}.

PLEASE DO NOT modify the tests by yourself -- Let me know if you think some of the tests are incorrect.

