import unittest

from collector import canonicalize_name_order, extract_name, is_helena_gawin_variant


class NameCanonicalizationTests(unittest.TestCase):
    def test_reorders_surname_first_with_common_given_name(self):
        self.assertEqual(canonicalize_name_order("Kowalski Jan"), "Jan Kowalski")

    def test_reorders_comma_separated_name(self):
        self.assertEqual(canonicalize_name_order("Kowalski, Jan"), "Jan Kowalski")

    def test_keeps_given_name_first(self):
        self.assertEqual(canonicalize_name_order("Jan Kowalski"), "Jan Kowalski")

    def test_extract_name_handles_surname_first_order(self):
        self.assertEqual(extract_name("Śp. Kowalski Jan"), "Jan Kowalski")

    def test_reorders_hyphenated_surname_first(self):
        self.assertEqual(canonicalize_name_order("Dereń-Gawin Helena"), "Helena Dereń-Gawin")

    def test_reorders_hyphenated_surname_first_with_comma_and_uppercase(self):
        self.assertEqual(canonicalize_name_order("DEREŃ-GAWIN, HELENA"), "Helena Dereń-Gawin")

    def test_extract_name_handles_hyphenated_surname_first(self):
        self.assertEqual(extract_name("Śp. Dereń-Gawin Helena"), "Helena Dereń-Gawin")


class HelenaVariantMatchingTests(unittest.TestCase):
    def test_matches_hyphenated_variant(self):
        self.assertTrue(is_helena_gawin_variant("Helena Dereń-Gawin"))

    def test_matches_without_polish_diacritics(self):
        self.assertTrue(is_helena_gawin_variant("Helena Deren Gawin"))

    def test_rejects_missing_gawin(self):
        self.assertFalse(is_helena_gawin_variant("Helena Dereń"))


if __name__ == "__main__":
    unittest.main()
