#!/usr/bin/env python3
"""Create a zip archive for the built application assets.

This helper is used by CI to normalise packaging across platforms.
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import zipfile


def build_archive(source: pathlib.Path, destination: pathlib.Path) -> None:
    if not source.exists():
        raise SystemExit(f"Source path does not exist: {source}")

    destination.parent.mkdir(parents=True, exist_ok=True)

    if destination.exists():
        destination.unlink()

    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        if source.is_dir():
            base = source.parent
            for file_path in sorted(source.rglob("*")):
                if file_path.is_dir():
                    continue
                arcname = file_path.relative_to(base)
                zf.write(file_path, arcname)
        else:
            zf.write(source, source.name)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a zip archive of build output")
    parser.add_argument("--source", required=True, help="Path to the directory or file to archive")
    parser.add_argument("--destination", required=True, help="Zip file to create")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    source = pathlib.Path(args.source).expanduser().resolve()
    destination = pathlib.Path(args.destination).expanduser().resolve()
    build_archive(source, destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
