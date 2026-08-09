import zipfile
import json
import os
import sys
import io

def hex_to_argb_int(hex_str):
    """Converts hex color string (#AARRGGBB, #RRGGBB, etc.) to 32-bit signed integer."""
    if not hex_str or not isinstance(hex_str, str):
        return 0
    clean_hex = hex_str.lstrip('#').strip()
    if len(clean_hex) == 6:
        clean_hex = 'FF' + clean_hex
    elif len(clean_hex) == 3:
        clean_hex = 'FF' + ''.join([c*2 for c in clean_hex])
    elif len(clean_hex) == 4:
        clean_hex = ''.join([c*2 for c in clean_hex])
    
    if len(clean_hex) != 8:
        return 0
    
    try:
        val = int(clean_hex, 16)
        if val > 0x7FFFFFFF:
            val -= 0x100000000
        return val
    except ValueError:
        return 0

def detect_theme_type(z):
    names = z.namelist()
    types = []
    if 'theme.json' in names:
        types.append('red_ui')
    if any('reader_schema' in n for n in names):
        types.append('red_typesetting')
    if 'appearance_kit.json' in names:
        types.append('arc_ui')
    if 'readConfig.json' in names and 'appearance_kit.json' not in names:
        types.append('typesetting')
    if 'manifest.json' in names:
        types.append('md3_ui')
    return types

def safe_write_zip(zout, written_files, arcname, data):
    if arcname not in written_files:
        zout.writestr(arcname, data)
        written_files.add(arcname)

def convert_red_to_md3_ui(input_path, output_path):
    print(f"[RED->MD3 App UI] Processing: {input_path}")
    written_files = set()
    with zipfile.ZipFile(input_path, 'r') as zin, zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        theme_json_raw = zin.read('theme.json').decode('utf-8', errors='ignore')
        theme_meta = json.loads(theme_json_raw)
        
        name = theme_meta.get('name', 'Redden Theme')
        light_cfg = theme_meta.get('light', {})
        dark_cfg = theme_meta.get('dark', {})
        
        assets_map = {}
        
        # 1. Background
        bg_added = False
        for candidate in ['light/theme_bg.img', 'light/theme_bg.jpg', 'light/theme_bg.png', 'light/bg.img', 'light/bg.jpg']:
            if candidate in zin.namelist():
                safe_write_zip(zout, written_files, 'assets/background/light.jpg', zin.read(candidate))
                assets_map['background.light'] = 'assets/background/light.jpg'
                bg_added = True
                break
        
        for candidate in ['dark/theme_bg.img', 'dark/theme_bg.jpg', 'dark/theme_bg.png', 'dark/bg.img', 'dark/bg.jpg']:
            if candidate in zin.namelist():
                safe_write_zip(zout, written_files, 'assets/background/dark.jpg', zin.read(candidate))
                assets_map['background.dark'] = 'assets/background/dark.jpg'
                break

        # 2. Navigation bar icons
        navbar_pack_id = light_cfg.get('navbarPackId')
        nav_mapping = {
            'home': ['home_normal.png', 'home_selected.png', 'home.png'],
            'bookshelf': ['bookshelf_normal.png', 'bookshelf_selected.png', 'bookshelf.png'],
            'explore': ['feature_normal.png', 'feature_selected.png', 'discovery_normal.png', 'explore.png'],
            'rss': ['notes_normal.png', 'notes_selected.png', 'rss_normal.png', 'rss.png'],
            'my': ['statistics_normal.png', 'statistics_selected.png', 'my_normal.png', 'my.png', 'settings_normal.png']
        }
        
        for target_key, filenames in nav_mapping.items():
            found = False
            if navbar_pack_id:
                for fname in filenames:
                    path = f"navbar_pack/{navbar_pack_id}/{fname}"
                    if path in zin.namelist():
                        out_path = f"assets/navigation/{target_key}.png"
                        safe_write_zip(zout, written_files, out_path, zin.read(path))
                        assets_map[f"navigation.{target_key}"] = out_path
                        found = True
                        break
            if not found:
                for name_in_zip in zin.namelist():
                    if any(fname in name_in_zip for fname in filenames) and name_in_zip.endswith(('.png', '.jpg')):
                        out_path = f"assets/navigation/{target_key}.png"
                        safe_write_zip(zout, written_files, out_path, zin.read(name_in_zip))
                        assets_map[f"navigation.{target_key}"] = out_path
                        break

        # 3. Fonts
        for name_in_zip in zin.namelist():
            if name_in_zip.endswith('.ttf') or name_in_zip.endswith('.otf'):
                safe_write_zip(zout, written_files, 'assets/fonts/app.ttf', zin.read(name_in_zip))
                assets_map['font.app'] = 'assets/fonts/app.ttf'
                break

        # 4. Cover albums
        cover_albums = []
        cover_gallery_id = light_cfg.get('coverGalleryId')
        light_images = []
        
        if cover_gallery_id:
            idx = 0
            for name_in_zip in sorted(zin.namelist()):
                if name_in_zip.startswith(f"cover_gallery/{cover_gallery_id}/") and name_in_zip.endswith(('.jpg', '.png', '.jpeg')):
                    out_path = f"cover-albums/album_0/light/image_{idx}.png"
                    safe_write_zip(zout, written_files, out_path, zin.read(name_in_zip))
                    light_images.append({"path": out_path})
                    idx += 1
        
        if light_images:
            cover_albums.append({
                "darkImages": [],
                "lightImages": light_images,
                "name": name,
                "ref": "album_0"
            })

        # 5. Build Config
        primary_light = hex_to_argb_int(light_cfg.get('primaryColor', '#FF8909'))
        primary_dark = hex_to_argb_int(dark_cfg.get('primaryColor', '#FFF5F5F5'))
        card_light = hex_to_argb_int(light_cfg.get('cardColor', '#FFFFFF'))
        card_dark = hex_to_argb_int(dark_cfg.get('cardColor', '#171719'))
        
        config = {
            "appColumnBackgroundOpacity": 100,
            "appTheme": "12",
            "baseCardBorderColor": 0,
            "baseCardBorderColorNight": 0,
            "baseCardBorderWidth": 1.0,
            "baseCardCornerRadius": 16.0,
            "bgImageBlurring": 3,
            "bgImageNBlurring": 0,
            "bookInfoBackgroundBlur": "on",
            "bookInfoDefaultCoverBackground": "on",
            "bookInfoFollowCoverColor": True,
            "bookInfoInputColor": 0,
            "bookInfoNetworkCoverBackground": "on",
            "bookshelfCardColor": card_light,
            "bookshelfCardColorDark": card_dark,
            "bottomBarBlurAlpha": 40,
            "bottomBarBlurRadius": 10,
            "bottomBarLensRadius": 24.0,
            "bottomBarOpacity": 94,
            "cNPrimary": primary_dark,
            "cPrimary": primary_light,
            "composeEngine": "material",
            "containerOpacity": int(light_cfg.get('cardBackgroundImageOpacity', 0.5) * 100) if isinstance(light_cfg.get('cardBackgroundImageOpacity'), (int, float)) else 74,
            "coverDefaultColor": True,
            "coverDefaultImage": "",
            "coverDefaultImageDark": "",
            "coverInfoOrientation": "0",
            "coverLoadOnlyWifi": False,
            "coverShadowColor": -16777216,
            "coverShadowColorN": -1,
            "coverShowAuthor": True,
            "coverShowAuthorN": True,
            "coverShowName": False,
            "coverShowNameN": False,
            "coverShowShadow": False,
            "coverShowStroke": True,
            "coverTextColor": -16777216,
            "coverTextColorN": -1,
            "coverUseDefault": True,
            "customContrast": "Default",
            "customMode": "tonalSpot",
            "defaultHomePage": "bookshelf",
            "disableSplicedColumnGroupCornerRadius": True,
            "enableBlur": True,
            "enableContainerBackgroundImage": bg_added,
            "enableCustomTagColors": True,
            "enableDeepPersonalization": False,
            "enableItemDivider": False,
            "enableProgressiveBlur": True,
            "fontScale": 10,
            "glassCardBackgroundOpacity": 74,
            "isPredictiveBackEnabled": True,
            "isPureBlack": False,
            "itemDividerColor": 0,
            "itemDividerLength": 80.0,
            "itemDividerWidth": 1.0,
            "labelContainerColor": 0,
            "labelContainerColorNight": 0,
            "labelVisibilityMode": "auto",
            "launcherIcon": "launcherw",
            "mainNavigationOrder": "home,bookshelf,explore,rss,my",
            "materialVersion": "material3",
            "navIconBookshelf": "",
            "navIconExplore": "",
            "navIconHome": "",
            "navIconMy": "",
            "navIconRss": "",
            "overrideBaseCardBorder": False,
            "overrideBaseCardCornerRadius": True,
            "paletteStyle": "tonalSpot",
            "primaryTextColor": hex_to_argb_int(light_cfg.get('foregroundColor', '#FF171717')),
            "primaryTextColorNight": hex_to_argb_int(dark_cfg.get('foregroundColor', '#FFFFFFFF')),
            "secondaryTextColor": hex_to_argb_int(light_cfg.get('mutedForegroundColor', '#FF3A6ABE')),
            "secondaryTextColorNight": hex_to_argb_int(dark_cfg.get('mutedForegroundColor', '#FF8C8C8E')),
            "secondaryThemeColor": 0,
            "secondaryThemeColorNight": 0,
            "showBottomView": True,
            "showDiscovery": True,
            "showHome": True,
            "showRss": True,
            "showStatusBar": True,
            "swipeAnimation": True,
            "tabletInterface": "auto",
            "themeBackgroundColor": hex_to_argb_int(light_cfg.get('backgroundColor', '#FFF2F3F5')),
            "themeBackgroundColorNight": hex_to_argb_int(dark_cfg.get('backgroundColor', '#FF000000')),
            "themeColor": 0,
            "themeColorNight": 0,
            "themeMode": "1",
            "topBarBlurAlpha": 73,
            "topBarBlurRadius": 29,
            "topBarOpacity": 100,
            "useFlexibleTopAppBar": False,
            "useFloatingBottomBar": True,
            "useFloatingBottomBarLiquidGlass": True,
            "useMiuixMonet": False
        }

        manifest = {
            "assets": assets_map,
            "config": config,
            "coverAlbums": cover_albums,
            "coverSelection": {"albumRef": "album_0"} if cover_albums else {},
            "formatVersion": 1,
            "name": name
        }

        safe_write_zip(zout, written_files, 'manifest.json', json.dumps(manifest, indent=2, ensure_ascii=False).encode('utf-8'))
        print(f"[RED->MD3 App UI] Saved to: {output_path}")

def convert_red_to_md3_typesetting(input_path, output_path):
    print(f"[RED->MD3 Typesetting] Processing: {input_path}")
    written_files = set()
    with zipfile.ZipFile(input_path, 'r') as zin, zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        schema_file = None
        bg_file = None
        for n in zin.namelist():
            if n.endswith('schema.json'):
                schema_file = n
            elif 'reader_schema' in n and (n.endswith('.img') or n.endswith('.jpg') or n.endswith('.png')):
                bg_file = n
        
        if not schema_file:
            print('No schema.json found in red file')
            return
            
        schema_data = json.loads(zin.read(schema_file).decode('utf-8', errors='ignore'))
        layout_cfg = {}
        if 'layoutConfig' in schema_data:
            if isinstance(schema_data['layoutConfig'], str):
                try:
                    layout_cfg = json.loads(schema_data['layoutConfig'])
                except:
                    pass
            elif isinstance(schema_data['layoutConfig'], dict):
                layout_cfg = schema_data['layoutConfig']
        
        bg_filename = ''
        if bg_file:
            bg_filename = 'bg_reader.jpg'
            safe_write_zip(zout, written_files, bg_filename, zin.read(bg_file))
            
        read_config = {
            'name': schema_data.get('name', 'Redden 排版'),
            'bgType': 2 if bg_filename else 0,
            'bgStr': bg_filename,
            'bgAlpha': 100,
            'textColor': schema_data.get('textColor', '#3E3D3B'),
            'textColorNight': '#ADADAD',
            'lineSpacingExtra': int(layout_cfg.get('lineSpacing', 12)),
            'paragraphSpacing': int(layout_cfg.get('paragraphSpacing', 18)),
            'textSize': int(layout_cfg.get('fontSize', 17)),
            'paddingLeft': int(layout_cfg.get('paddingLeft', 30)),
            'paddingRight': int(layout_cfg.get('paddingRight', 30)),
            'headerPaddingTop': int(layout_cfg.get('headerPaddingTop', 64)),
            'footerPaddingBottom': int(layout_cfg.get('footerPaddingBottom', 14)),
            'titleBottomSpacing': int(layout_cfg.get('titlePaddingBottom', 27)),
            'titleTopSpacing': int(layout_cfg.get('titleMarginTop', 1))
        }
        
        safe_write_zip(zout, written_files, 'readConfig.json', json.dumps(read_config, indent=2, ensure_ascii=False).encode('utf-8'))
        print(f"[RED->MD3 Typesetting] Saved to: {output_path}")

def convert_arc_typesetting_to_md3(input_path, output_path):
    print(f"[Arc Typesetting->MD3 Typesetting] Processing: {input_path}")
    written_files = set()
    with zipfile.ZipFile(input_path, 'r') as zin, zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        read_config_bytes = zin.read('readConfig.json')
        read_config = json.loads(read_config_bytes.decode('utf-8', errors='ignore'))
        
        bg_str = read_config.get('bgStr', '')
        if '/' in bg_str or '\\\\' in bg_str:
            bg_filename = os.path.basename(bg_str.replace('\\\\', '/'))
            read_config['bgStr'] = bg_filename
            
        for fn in zin.namelist():
            if fn != 'readConfig.json':
                base_fn = os.path.basename(fn)
                if base_fn:
                    safe_write_zip(zout, written_files, base_fn, zin.read(fn))
                
        safe_write_zip(zout, written_files, 'readConfig.json', json.dumps(read_config, indent=2, ensure_ascii=False).encode('utf-8'))
        print(f"[Arc Typesetting->MD3 Typesetting] Saved to: {output_path}")

def convert_arc_to_md3_ui(input_path, output_path):
    print(f"[ARC->MD3 App UI] Processing: {input_path}")
    written_files = set()
    with zipfile.ZipFile(input_path, 'r') as zin, zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        kit_meta = json.loads(zin.read('appearance_kit.json').decode('utf-8', errors='ignore'))
        name = kit_meta.get('name', 'Arc Theme')
        
        assets_map = {}
        cover_albums = []
        config_data = {}
        
        for comp in kit_meta.get('components', []):
            cpath = comp.get('path')
            ctype = comp.get('type')
            is_night = comp.get('isNight', False)
            
            if cpath in zin.namelist():
                sub_bytes = zin.read(cpath)
                with zipfile.ZipFile(io.BytesIO(sub_bytes)) as sub_zip:
                    if ctype == 'THEME':
                        for sub_f in sub_zip.namelist():
                            if sub_f.endswith('theme.json'):
                                theme_data = json.loads(sub_zip.read(sub_f).decode('utf-8', errors='ignore'))
                                cfg = theme_data.get('config', {})
                                config_data.update(cfg)
                                name = cfg.get('themeName', name)
                                bg_path = cfg.get('backgroundImgPath')
                                if bg_path:
                                    for sf in sub_zip.namelist():
                                        if sf.endswith(bg_path):
                                            target_key = 'background.dark' if is_night else 'background.light'
                                            out_path = f"assets/background/{'dark' if is_night else 'light'}.jpg"
                                            safe_write_zip(zout, written_files, out_path, sub_zip.read(sf))
                                            assets_map[target_key] = out_path
                                            break
                            if sub_f.endswith('.ttf') or sub_f.endswith('.otf'):
                                safe_write_zip(zout, written_files, 'assets/fonts/app.ttf', sub_zip.read(sub_f))
                                assets_map['font.app'] = 'assets/fonts/app.ttf'

                    elif ctype == 'NAVIGATION_BAR' and not is_night:
                        nav_mapping = {
                            'home': ['home_normal.png', 'home_selected.png'],
                            'bookshelf': ['bookshelf_normal.png', 'bookshelf_selected.png'],
                            'explore': ['discovery_normal.png', 'discovery_selected.png', 'feature_normal.png'],
                            'rss': ['rss_normal.png', 'rss_selected.png', 'readRecord_normal.png'],
                            'my': ['my_normal.png', 'my_selected.png', 'settings_normal.png']
                        }
                        for target_key, filenames in nav_mapping.items():
                            for sf in sub_zip.namelist():
                                if any(sf.endswith(fn) for fn in filenames):
                                    out_path = f"assets/navigation/{target_key}.png"
                                    safe_write_zip(zout, written_files, out_path, sub_zip.read(sf))
                                    assets_map[f"navigation.{target_key}"] = out_path
                                    break
                    
                    elif ctype == 'COVER_COLLECTION':
                        light_images = []
                        idx = 0
                        for sf in sorted(sub_zip.namelist()):
                            if sf.endswith(('.jpg', '.png', '.jpeg')) and 'cover_' in sf:
                                out_path = f"cover-albums/album_0/light/image_{idx}.png"
                                safe_write_zip(zout, written_files, out_path, sub_zip.read(sf))
                                light_images.append({"path": out_path})
                                idx += 1
                        if light_images:
                            cover_albums.append({
                                "darkImages": [],
                                "lightImages": light_images,
                                "name": name,
                                "ref": "album_0"
                            })

        c_primary = hex_to_argb_int(config_data.get('primaryColor', '#FF8909'))
        card_bg = hex_to_argb_int(config_data.get('cardColor', '#FFFFFF'))
        
        config = {
            "appColumnBackgroundOpacity": 100,
            "appTheme": "12",
            "baseCardBorderColor": 0,
            "baseCardBorderColorNight": 0,
            "baseCardBorderWidth": 1.0,
            "baseCardCornerRadius": 16.0,
            "bgImageBlurring": config_data.get('backgroundImgBlur', 3),
            "bgImageNBlurring": 0,
            "bookInfoBackgroundBlur": "on",
            "bookInfoDefaultCoverBackground": "on",
            "bookInfoFollowCoverColor": True,
            "bookInfoInputColor": 0,
            "bookInfoNetworkCoverBackground": "on",
            "bookshelfCardColor": card_bg,
            "bookshelfCardColorDark": 0,
            "bottomBarBlurAlpha": 40,
            "bottomBarBlurRadius": 10,
            "bottomBarLensRadius": 24.0,
            "bottomBarOpacity": 94,
            "cNPrimary": -1282867320,
            "cPrimary": c_primary,
            "composeEngine": "material",
            "containerOpacity": config_data.get('uiLayoutAlpha', 74),
            "coverDefaultColor": True,
            "coverDefaultImage": "",
            "coverDefaultImageDark": "",
            "coverInfoOrientation": "0",
            "coverLoadOnlyWifi": False,
            "coverShadowColor": -16777216,
            "coverShadowColorN": -1,
            "coverShowAuthor": True,
            "coverShowAuthorN": True,
            "coverShowName": False,
            "coverShowNameN": False,
            "coverShowShadow": False,
            "coverShowStroke": True,
            "coverTextColor": -16777216,
            "coverTextColorN": -1,
            "coverUseDefault": True,
            "customContrast": "Default",
            "customMode": "tonalSpot",
            "defaultHomePage": "bookshelf",
            "disableSplicedColumnGroupCornerRadius": True,
            "enableBlur": True,
            "enableContainerBackgroundImage": 'background.light' in assets_map,
            "enableCustomTagColors": True,
            "enableDeepPersonalization": False,
            "enableItemDivider": False,
            "enableProgressiveBlur": True,
            "fontScale": 10,
            "glassCardBackgroundOpacity": 74,
            "isPredictiveBackEnabled": True,
            "isPureBlack": False,
            "itemDividerColor": 0,
            "itemDividerLength": 80.0,
            "itemDividerWidth": 1.0,
            "labelContainerColor": 0,
            "labelContainerColorNight": 0,
            "labelVisibilityMode": "auto",
            "launcherIcon": "launcherw",
            "mainNavigationOrder": "home,bookshelf,explore,rss,my",
            "materialVersion": "material3",
            "navIconBookshelf": "",
            "navIconExplore": "",
            "navIconHome": "",
            "navIconMy": "",
            "navIconRss": "",
            "overrideBaseCardBorder": False,
            "overrideBaseCardCornerRadius": True,
            "paletteStyle": "tonalSpot",
            "primaryTextColor": hex_to_argb_int(config_data.get('uiFontColor', '#000000')),
            "primaryTextColorNight": 0,
            "secondaryTextColor": 0,
            "secondaryTextColorNight": 0,
            "secondaryThemeColor": 0,
            "secondaryThemeColorNight": 0,
            "showBottomView": True,
            "showDiscovery": True,
            "showHome": True,
            "showRss": True,
            "showStatusBar": True,
            "swipeAnimation": True,
            "tabletInterface": "auto",
            "themeBackgroundColor": hex_to_argb_int(config_data.get('backgroundColor', '#F2F3F5')),
            "themeBackgroundColorNight": 0,
            "themeColor": 0,
            "themeColorNight": 0,
            "themeMode": "1",
            "topBarBlurAlpha": 73,
            "topBarBlurRadius": 29,
            "topBarOpacity": 100,
            "useFlexibleTopAppBar": False,
            "useFloatingBottomBar": True,
            "useFloatingBottomBarLiquidGlass": True,
            "useMiuixMonet": False
        }

        manifest = {
            "assets": assets_map,
            "config": config,
            "coverAlbums": cover_albums,
            "coverSelection": {"albumRef": "album_0"} if cover_albums else {},
            "formatVersion": 1,
            "name": name
        }

        safe_write_zip(zout, written_files, 'manifest.json', json.dumps(manifest, indent=2, ensure_ascii=False).encode('utf-8'))
        print(f"[ARC->MD3 App UI] Saved to: {output_path}")

def auto_convert(input_path, output_dir=None):
    if not os.path.exists(input_path):
        print(f"Error: File not found {input_path}")
        return False
    
    if output_dir is None:
        output_dir = os.path.dirname(input_path) or '.'
        
    base_name = os.path.splitext(os.path.basename(input_path))[0]
    
    with zipfile.ZipFile(input_path, 'r') as z:
        types = detect_theme_type(z)
        
    if 'red_ui' in types or 'red_typesetting' in types:
        if 'red_ui' in types:
            out_ui = os.path.join(output_dir, f"{base_name}_应用界面.md3.zip")
            convert_red_to_md3_ui(input_path, out_ui)
        if 'red_typesetting' in types:
            out_ts = os.path.join(output_dir, f"{base_name}_阅读排版.md3.zip")
            convert_red_to_md3_typesetting(input_path, out_ts)
        return True
    elif 'typesetting' in types:
        out_ts = os.path.join(output_dir, f"{base_name}_converted.md3.zip")
        convert_arc_typesetting_to_md3(input_path, out_ts)
        return True
    elif 'arc_ui' in types:
        out_ui = os.path.join(output_dir, f"{base_name}_converted.md3.zip")
        convert_arc_to_md3_ui(input_path, out_ui)
        return True
    else:
        print(f"Unsupported theme format in {input_path}")
        return False

if __name__ == '__main__':
    if len(sys.argv) > 1:
        in_file = sys.argv[1]
        auto_convert(in_file)
    else:
        print("--- Running Test Conversion on Sample Folder ---")
        sample_dir = r'C:\Users\dday9\Desktop\阅读美化示例'
        for f in os.listdir(sample_dir):
            if f.endswith(('.red', '.zip')):
                auto_convert(os.path.join(sample_dir, f), 'c:\\Users\\dday9\\Desktop\\阅读美化')
