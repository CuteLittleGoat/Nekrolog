import unittest

from collector import canonicalize_name_order, extract_name


class NameCanonicalizationTests(unittest.TestCase):
    def test_reorders_surname_first_with_common_given_name(self):
        self.assertEqual(canonicalize_name_order("Kowalski Jan"), "Jan Kowalski")

    def test_reorders_comma_separated_name(self):
        self.assertEqual(canonicalize_name_order("Kowalski, Jan"), "Jan Kowalski")

    def test_keeps_given_name_first(self):
        self.assertEqual(canonicalize_name_order("Jan Kowalski"), "Jan Kowalski")

    def test_extract_name_handles_surname_first_order(self):
        self.assertEqual(extract_name("Śp. Kowalski Jan"), "Jan Kowalski")


if __name__ == "__main__":
    unittest.main()
