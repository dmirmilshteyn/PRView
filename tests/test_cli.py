import unittest
from pathlib import Path

from cli.cli import build_parser, sync_repository


class CliTests(unittest.TestCase):
    def test_sync_subcommand_parses_repository_and_defaults(self):
        options = build_parser().parse_args(["sync", "acme/widgets"])

        self.assertEqual("sync", options.command)
        self.assertEqual("acme/widgets", options.repository)
        self.assertEqual(Path("artifacts"), options.output)
        self.assertEqual(100, options.limit)
        self.assertIs(sync_repository, options.handler)


if __name__ == "__main__":
    unittest.main()
