#!/usr/bin/env python3
"""Read-only mounted Kobo snapshot. Outputs PRIVATE data: never commit it."""
import argparse, os, pathlib, shutil, sqlite3, tempfile, re
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--device',default='/Volumes/KOBOeReader')
parser.add_argument('--output',required=True,help='Private output directory, preferably outside the repository')
a=parser.parse_args();root=pathlib.Path(a.device);out=pathlib.Path(a.output)
out.mkdir(parents=True,exist_ok=True)
def signature(p):
 return [(x.stat().st_size,x.stat().st_mtime_ns) if x.exists() else None for x in [pathlib.Path(str(p)+s) for s in ['', '-wal','-shm','-journal']]]
for relative in ['.kobo/KoboReader.sqlite','.adds/koreader/settings/statistics.sqlite3','.adds/kobalt/kobalt.sqlite']:
 src=root/relative
 if not src.exists():continue
 target=out/src.name
 if target.exists():raise SystemExit('Refusing to overwrite existing snapshot: '+str(target))
 with tempfile.TemporaryDirectory(prefix='kobo-snapshot-') as td:
  before=signature(src);tmp=pathlib.Path(td)/src.name
  for suffix in ['', '-wal','-shm','-journal']:
   p=pathlib.Path(str(src)+suffix)
   if p.exists():shutil.copyfile(p,str(tmp)+suffix)
  if signature(src)!=before:raise SystemExit('Source changed during snapshot. Keep Kobo in USB storage mode and try again.')
  c=sqlite3.connect(str(tmp));dest=sqlite3.connect(str(target))
  try:
   c.backup(dest)
   if dest.execute('pragma quick_check').fetchone()[0]!='ok':raise RuntimeError('Snapshot failed integrity check')
  finally:c.close();dest.close()
  os.chmod(target,0o600)
for d,dirs,files in os.walk(root):
 dirs[:]=[x for x in dirs if x not in ['images','.Trash','.Trashes','.Spotlight-V100','.fseventsd']]
 for f in files:
  if re.fullmatch(r'metadata\.\w+\.lua',f):
   src=pathlib.Path(d)/f;target=out/src.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True)
   if not target.exists():shutil.copyfile(src,target);os.chmod(target,0o600)
print('Private snapshots written to',out)
print('Select this folder in the application. Originals were never opened by SQLite or modified.')
