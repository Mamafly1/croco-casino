#!/usr/bin/env python3
"""Lit l'index pak01_dir.vpk de CS2 et dit quelles archives pak01_NNN.vpk télécharger
pour avoir les couteaux, les gants et les textures de skins. N'écrit rien, ne télécharge rien.

Usage : python tools/vpk-archives.py chemin/vers/pak01_dir.vpk
"""
import struct
import sys
from collections import defaultdict

# Ce qu'on veut récupérer (préfixes de chemins dans le jeu)
WANTED = {
    'couteaux (modèles)': ('models/weapons/v_knife', 'models/weapons/w_knife'),
    'gants (modèles)': ('models/weapons/v_models/arms/glove', 'models/weapons/w_models/arms/glove'),
    'textures de skins': ('materials/models/weapons/customization/paints',),
    'matériaux couteaux / gants': ('materials/models/weapons/v_models/knife', 'materials/models/weapons/v_models/arms/glove'),
}


def read_cstr(data, pos):
    end = data.index(b'\0', pos)
    return data[pos:end].decode('utf-8', 'replace'), end + 1


def entries(path):
    data = open(path, 'rb').read()
    sig, version, tree_size = struct.unpack_from('<III', data, 0)
    if sig != 0x55AA1234:
        sys.exit("Ce fichier n'est pas un index VPK.")
    pos = 12 if version == 1 else 28
    end = pos + tree_size
    while pos < end:
        ext, pos = read_cstr(data, pos)
        if not ext:
            break
        while True:
            folder, pos = read_cstr(data, pos)
            if not folder:
                break
            while True:
                name, pos = read_cstr(data, pos)
                if not name:
                    break
                _crc, preload, archive, _offset, length, _term = struct.unpack_from('<IHHIIH', data, pos)
                pos += 18 + preload
                full = (folder.strip() + '/' if folder.strip() not in ('', ' ') else '') + name + '.' + ext
                yield full, archive, length


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    per_group = defaultdict(lambda: [0, 0, set()])
    archives = set()
    for full, archive, length in entries(sys.argv[1]):
        for group, prefixes in WANTED.items():
            if full.startswith(prefixes):
                g = per_group[group]
                g[0] += 1
                g[1] += length
                if archive != 0x7FFF:  # 0x7FFF = fichier rangé dans l'index lui-même
                    g[2].add(archive)
                    archives.add(archive)
    for group in WANTED:
        n, size, arcs = per_group[group]
        print(f'{group} : {n} fichiers, {size / 1e6:.0f} Mo, archives {sorted(arcs)}')
    print()
    print('Lignes à mettre dans liste.txt :')
    print(r'regex:pak01_dir\.vpk$')
    for a in sorted(archives):
        print(rf'regex:pak01_{a:03d}\.vpk$')


if __name__ == '__main__':
    main()
