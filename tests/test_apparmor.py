"""Package/policy checks, plus optional real AppArmor compilation (never load it)."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AppArmorPolicyTests(unittest.TestCase):
    def setUp(self):
        self.profile = (ROOT / 'cdshelf/apparmor.txt').read_text()
        self.config = (ROOT / 'cdshelf/config.yaml').read_text()
        self.rules = '\n'.join(line for line in self.profile.splitlines() if not line.lstrip().startswith('#'))

    def test_supervisor_can_discover_one_enforcing_profile_with_the_app_slug(self):
        # Match Supervisor's get_profile_name() contract, including column zero.
        names = re.findall(r'^profile ([^ ]+).*$', self.profile, re.MULTILINE)
        slug = re.search(r'^slug: (\S+)$', self.config, re.MULTILINE).group(1)
        self.assertEqual(names, [slug])
        self.assertRegex(self.config, r'(?m)^apparmor: true$')
        self.assertNotRegex(self.rules, r'\b(complain|unconfined|default_allow)\b')
        for key in ('full_access', 'docker_api', 'host_pid', 'host_network'):
            self.assertNotRegex(self.config, rf'(?m)^{key}: true$')

    def test_policy_does_not_grant_general_writes_or_arbitrary_execution(self):
        self.assertNotRegex(self.rules, r'(?m)^\s*(file|network|capability|mount|umount|pivot_root|change_profile)\s*[,;]')
        self.assertNotIn('capability ', self.rules)
        self.assertNotIn('include <abstractions/', self.profile)
        file_rules = dict(re.findall(r'^\s*(/\S+)\s+([a-zA-Z]+),$', self.rules, re.MULTILINE))
        self.assertEqual(file_rules['/app/**'], 'r')
        self.assertEqual(file_rules['/data/options.json'], 'r')
        self.assertNotIn('/data/**', file_rules)
        writable = {path for path, mode in file_rules.items() if set(mode) & set('walk')}
        self.assertEqual(writable, {'/dev/null', '/dev/zero'})
        executables = {path: mode for path, mode in file_rules.items() if 'x' in mode.lower()}
        self.assertEqual(set(executables), {'/sbin/docker-init', '/dev/init', '/usr/local/bin/python{,3,3.13}'})
        self.assertTrue(all(mode == 'rix' for mode in executables.values()))
        dockerfile = (ROOT / 'cdshelf/Dockerfile').read_text()
        command = json.loads(next(line[4:] for line in dockerfile.splitlines() if line.startswith('CMD ')))
        self.assertEqual(command[0], '/usr/local/bin/python')
        self.assertIn('PYTHONDONTWRITEBYTECODE=1', dockerfile)

    def test_real_parser_compiles_original_and_supervisor_renamed_profiles(self):
        parser = os.environ.get('CDSHELF_APPARMOR_PARSER') or shutil.which('apparmor_parser')
        if not parser:
            self.skipTest('Install apparmor_parser to check compilation; no kernel policy is loaded.')
        include_dir = os.environ.get('CDSHELF_APPARMOR_INCLUDE_DIR')
        with tempfile.TemporaryDirectory() as directory:
            for name in ('cdshelf', 'local_cdshelf', '01234567_cdshelf'):
                path = Path(directory) / 'apparmor.txt'
                path.write_text(self.profile.replace('profile cdshelf ', f'profile {name} ', 1))
                command = [parser, '-Q', '-T', '-K']  # compile only; never load/cache
                if include_dir:
                    command += ['-I', include_dir]
                result = subprocess.run(command + [str(path)], capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, f'{name}: {result.stderr}')


if __name__ == '__main__':
    unittest.main()
