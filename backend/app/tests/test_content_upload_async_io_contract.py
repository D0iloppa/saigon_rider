import unittest
from pathlib import Path


class ContentUploadAsyncIoContractTests(unittest.TestCase):
    def test_directory_creation_and_file_write_leave_the_event_loop(self):
        source = (Path(__file__).parents[1] / "routers" / "contents.py").read_text(encoding="utf-8")

        self.assertIn(
            "await asyncio.to_thread(abs_dir.mkdir, parents=True, exist_ok=True)",
            source,
        )
        self.assertIn("await asyncio.to_thread(abs_path.write_bytes, data)", source)
        self.assertNotIn("\n    abs_path.write_bytes(data)", source)


if __name__ == "__main__":
    unittest.main()
