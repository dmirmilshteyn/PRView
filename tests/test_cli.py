import unittest
from pathlib import Path

from cli.cli import build_parser, sync_repository


class CliTests(unittest.TestCase):
    def test_sync_subcommand_parses_repository_and_defaults(self):
        options = build_parser().parse_args(["sync", "acme/widgets", "23"])

        self.assertEqual("sync", options.command)
        self.assertEqual("acme/widgets", options.repository)
        self.assertEqual(Path("artifacts"), options.output)
        self.assertIsNone(options.limit)
        self.assertEqual(23, options.number)
        self.assertFalse(options.all)
        self.assertIs(sync_repository, options.handler)

    def test_all_has_no_default_cap(self):
        options = build_parser().parse_args(["sync", "acme/widgets", "--all"])
        self.assertTrue(options.all)
        self.assertIsNone(options.number)
        self.assertIsNone(options.limit)

    def test_requires_exactly_one_selection_and_positive_numbers(self):
        for arguments in [[], ["23", "--all"], ["0"], ["-1"], ["abc"]]:
            with self.subTest(arguments=arguments), self.assertRaises(SystemExit):
                build_parser().parse_args(["sync", "acme/widgets", *arguments])


if __name__ == "__main__":
    unittest.main()
