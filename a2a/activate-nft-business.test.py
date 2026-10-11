#!/usr/bin/env python3
"""Tests for NFT add-on: no live OpenClaw calls."""
import importlib.util
import json
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('activate-nft-business.py')
spec = importlib.util.spec_from_file_location('activate_nft_business', SCRIPT)
act = importlib.util.module_from_spec(spec)
spec.loader.exec_module(act)

class ActivationTests(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.root = Path(self.t.name)
        self.patch = [
            patch.object(act, 'ROOT', self.root),
            patch.object(act, 'BACKUP', self.root / 'mission-before.txt'),
            patch.object(act, 'LEDGER', self.root / 'nft-opportunities.json'),
        ]
        for p in self.patch: p.start()
        self.current = 'Existing 6.0 strategic mission\nKEEP-SAFETY-AND-BUDGET\n'
        self.calls = []

    def tearDown(self):
        for p in reversed(self.patch): p.stop()
        self.t.cleanup()

    def runner(self, args, **kwargs):
        self.calls.append(args)
        if args[:3] == ['openclaw','cron','list']:
            return subprocess.CompletedProcess(args, 0, stdout=json.dumps({'jobs':[
                {'id':act.JOB_ID,'payload':{'message':self.current}}
            ]}))
        if args[:3] == ['openclaw','cron','edit']:
            self.current = args[5]
            return subprocess.CompletedProcess(args, 0)
        raise AssertionError(f'Unexpected subprocess args: {args}')

    def test_installs_without_overwriting_safety_mission_or_creating_cron(self):
        with patch.object(act.subprocess, 'run', side_effect=self.runner):
            self.assertEqual(act.main([]),0)
        self.assertTrue(self.current.startswith('Existing 6.0 strategic mission\nKEEP-SAFETY-AND-BUDGET'))
        self.assertIn(act.MARKER, self.current)
        self.assertEqual(self.current.count(act.MARKER), 1)
        self.assertEqual((self.root / 'mission-before.txt').read_text(),
                         'Existing 6.0 strategic mission\nKEEP-SAFETY-AND-BUDGET\n')
        self.assertEqual(json.loads((self.root / 'nft-opportunities.json').read_text()),
                         {'version':1,'opportunities':[]})
        self.assertEqual(len([x for x in self.calls if x[2] == 'edit']), 1)
        self.assertFalse(any('add' in x or 'enable' in x or 'run' in x for x in self.calls))
        mode = stat.S_IMODE((self.root / 'mission-before.txt').stat().st_mode)
        self.assertEqual(mode,0o600)

    def test_idempotent_no_second_edit_and_doesnt_overwrite_nft_data(self):
        with patch.object(act.subprocess, 'run', side_effect=self.runner):
            act.main([])
            (self.root / 'nft-opportunities.json').write_text('important existing data')
            self.calls.clear()
            act.main([])
        self.assertEqual(len([x for x in self.calls if x[2] == 'edit']),0)
        self.assertEqual((self.root / 'nft-opportunities.json').read_text(), 'important existing data')
        self.assertEqual(self.current.count(act.MARKER),1)

    def test_check_never_mutates_existing_state(self):
        with patch.object(act.subprocess, 'run', side_effect=self.runner):
            self.assertEqual(act.main(['--check']),1)
            self.current += '\n' + act.ADDENDUM
            self.assertEqual(act.main(['--check']),0)
        self.assertEqual(list(self.root.iterdir()),[])

    def test_missing_mission_fail_closed(self):
        def invalid(args, **kwargs):
            return subprocess.CompletedProcess(args, 0, stdout=json.dumps({'jobs': []}))
        with patch.object(act.subprocess, 'run', side_effect=invalid):
            with self.assertRaisesRegex(RuntimeError, 'not found'):
                act.main([])
        self.assertEqual(list(self.root.iterdir()),[])

    def test_existing_backup_preserved(self):
        (self.root / 'mission-before.txt').write_text('do not overwrite')
        with patch.object(act.subprocess, 'run', side_effect=self.runner):
            act.main([])
        self.assertEqual((self.root / 'mission-before.txt').read_text(),'do not overwrite')

if __name__ == '__main__': unittest.main()
