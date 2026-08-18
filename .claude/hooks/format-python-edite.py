#!/usr/bin/env python3
"""Formate et corrige un fichier Python dès qu'il vient d'être édité.

Pourquoi un hook et pas une consigne : une consigne dans AGENTS.md dit
« lancer ruff avant de pousser ». L'agent l'oublie, la CI devient rouge, et on
perd un aller-retour. Un hook s'exécute toujours, sans dépendre de la mémoire
de qui que ce soit.

Portée volontairement étroite : uniquement les .py sous mcp-servers/. Le reste
du dépôt est régi par le pre-commit d'OpenHands, qu'on ne veut pas doubler.

Entrée : le JSON du hook PostToolUse sur stdin.
Sortie : rien si tout va bien ; un additionalContext si ruff signale quelque
chose qu'il n'a pas pu corriger seul.
"""

import json
import subprocess
import sys
from pathlib import Path

PORTEE = 'mcp-servers/'


def lire_chemin() -> Path | None:
    try:
        charge = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return None

    entree = charge.get('tool_input') or {}
    brut = entree.get('file_path') or entree.get('notebook_path')
    if not isinstance(brut, str) or not brut:
        return None

    chemin = Path(brut)
    if chemin.suffix != '.py' or not chemin.exists():
        return None
    if PORTEE not in chemin.as_posix():
        return None
    return chemin


def ruff(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ['ruff', *arguments],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )


def main() -> int:
    chemin = lire_chemin()
    if chemin is None:
        return 0

    try:
        ruff('format', str(chemin))
        verification = ruff('check', '--fix', str(chemin))
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # Pas de ruff installé, ou trop lent : ne jamais bloquer une édition.
        return 0

    if verification.returncode != 0:
        reste = (verification.stdout or verification.stderr or '').strip()
        if reste:
            print(
                json.dumps(
                    {
                        'hookSpecificOutput': {
                            'hookEventName': 'PostToolUse',
                            'additionalContext': (
                                f'ruff n a pas pu tout corriger seul dans '
                                f'{chemin.name} :\n{reste[:2000]}'
                            ),
                        }
                    }
                )
            )
    return 0


if __name__ == '__main__':
    sys.exit(main())
