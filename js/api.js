(function (global) {
  var SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  var SHEETS = { clothes: '衣服', outfits: '搭配', options: '選項' };
  var CLOTHES_HEADERS = ['編號', '名稱', '類別', '顏色', '季節', '場合', '品牌', '存放位置', '狀態', '照片網址', '購入日期', '上次穿著', '備註'];
  var OUTFIT_HEADERS = ['編號', '名稱', '場合', '衣服編號', '備註', '建立日期'];
  var token = '';
  var tokenExp = 0;
  var tokenClient = null;
  var sheetIds = null;

  function cfg() { return global.WARDROBE_CONFIG || {}; }

  function uiEn() {
    try { return localStorage.getItem('wardrobe-lang') === 'en'; } catch (e) { return false; }
  }

  function uiMsg(zh, en) { return uiEn() ? en : zh; }

  function todayHK() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
  }

  function hasAppsScript() {
    return typeof google !== 'undefined' && google.script && google.script.run;
  }

  function needsGoogleSignIn() {
    return !!cfg().CLIENT_ID && !hasAppsScript();
  }

  function isSignedIn() {
    return !!token && Date.now() < tokenExp - 15000;
  }

  function waitForGis() {
    return new Promise(function (resolve, reject) {
      if (global.google && google.accounts && google.accounts.oauth2) return resolve();
      var n = 0;
      var t = setInterval(function () {
        n += 1;
        if (global.google && google.accounts && google.accounts.oauth2) {
          clearInterval(t);
          resolve();
        } else if (n > 50) {
          clearInterval(t);
          reject(new Error(uiMsg('無法載入 Google 登入元件，請檢查網路後再試。', 'Could not load Google sign-in. Check your connection and try again.')));
        }
      }, 100);
    });
  }

  function init() {
    return Promise.resolve();
  }

  function ensureTokenClient() {
    return waitForGis().then(function () {
      if (tokenClient) return;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: cfg().CLIENT_ID,
        scope: SCOPE,
        callback: function () {}
      });
    });
  }

  function signIn() {
    if (!cfg().CLIENT_ID) {
      return Promise.reject(new Error(uiMsg('尚未設定 Google OAuth Client ID', 'Google OAuth Client ID is not set yet')));
    }
    if (isSignedIn()) return Promise.resolve();
    return ensureTokenClient().then(function () {
      return new Promise(function (resolve, reject) {
        tokenClient.callback = function (resp) {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          token = resp.access_token;
          var sec = parseInt(resp.expires_in, 10);
          tokenExp = Date.now() + (isNaN(sec) ? 3600 : sec) * 1000;
          resolve();
        };
        tokenClient.requestAccessToken({ prompt: isSignedIn() ? '' : 'consent' });
      });
    });
  }

  function signOut() {
    if (token && global.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(token); } catch (e) {}
    }
    token = '';
    tokenExp = 0;
  }

  function api(path, method, body) {
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(cfg().SPREADSHEET_ID) + path;
    var opts = {
      method: method || 'GET',
      headers: { Authorization: 'Bearer ' + token }
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var msg = (data.error && data.error.message) || uiMsg('Google Sheets 請求失敗（' + res.status + '）', 'Google Sheets request failed (' + res.status + ')');
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function valuesGet(range) {
    return api('/values/' + encodeURIComponent(range) + '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING', 'GET');
  }

  function valuesUpdate(range, rows) {
    return api('/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED', 'PUT', { range: range, values: rows });
  }

  function valuesAppend(range, rows) {
    return api('/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', 'POST', { values: rows });
  }

  function loadSheetIds() {
    if (sheetIds) return Promise.resolve(sheetIds);
    return api('?fields=sheets.properties', 'GET').then(function (data) {
      sheetIds = {};
      (data.sheets || []).forEach(function (s) {
        sheetIds[s.properties.title] = s.properties.sheetId;
      });
      return sheetIds;
    });
  }

  function deleteRow(sheetName, rowNumber) {
    return loadSheetIds().then(function (ids) {
      var sid = ids[sheetName];
      if (sid == null) throw new Error(uiMsg('找不到工作表「' + sheetName + '」', 'Could not find the sheet “' + sheetName + '”'));
      return api(':batchUpdate', 'POST', {
        requests: [{
          deleteDimension: {
            range: { sheetId: sid, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber }
          }
        }]
      });
    });
  }

  function formatCell(v) {
    if (v == null || v === '') return '';
    return String(v);
  }

  function rowsToObjects(headers, rows) {
    var list = [];
    (rows || []).forEach(function (row) {
      var has = false;
      for (var k = 0; k < row.length; k++) {
        if (row[k] !== '' && row[k] != null) { has = true; break; }
      }
      if (!has) return;
      var obj = {};
      for (var j = 0; j < headers.length; j++) obj[headers[j]] = formatCell(row[j]);
      if (obj['編號'] || obj['名稱']) list.push(obj);
    });
    return list;
  }

  function uniqueList(arr) {
    var seen = {};
    var out = [];
    (arr || []).forEach(function (v) {
      v = String(v || '').trim();
      if (v && !seen[v]) { seen[v] = true; out.push(v); }
    });
    return out;
  }

  function nextId(items, prefix) {
    var max = 0;
    (items || []).forEach(function (it) {
      var m = String(it['編號'] || '').match(/^([A-Za-z]+)(\d+)$/);
      if (m && m[1].toUpperCase() === prefix) {
        var n = parseInt(m[2], 10);
        if (n > max) max = n;
      }
    });
    return prefix + String(max + 1).padStart(3, '0');
  }

  function itemToRow(item) {
    return CLOTHES_HEADERS.map(function (h) {
      if (h === '狀態' && !item[h]) return '可穿';
      return item[h] || '';
    });
  }

  function getWardrobe() {
    return Promise.all([
      valuesGet(SHEETS.clothes + '!A2:M'),
      valuesGet(SHEETS.outfits + '!A2:F'),
      valuesGet(SHEETS.options + '!A2:D')
    ]).then(function (parts) {
      var clothes = rowsToObjects(CLOTHES_HEADERS, parts[0].values);
      var outfits = rowsToObjects(OUTFIT_HEADERS, parts[1].values);
      var options = { '類別': [], '季節': [], '場合': [], '狀態': [] };
      (parts[2].values || []).forEach(function (row) {
        if (row[0]) options['類別'].push(String(row[0]));
        if (row[1]) options['季節'].push(String(row[1]));
        if (row[2]) options['場合'].push(String(row[2]));
        if (row[3]) options['狀態'].push(String(row[3]));
      });
      options['類別'] = uniqueList(options['類別']);
      options['季節'] = uniqueList(options['季節']);
      options['場合'] = uniqueList(options['場合']);
      options['狀態'] = uniqueList(options['狀態']);
      return { clothes: clothes, outfits: outfits, options: options, today: todayHK() };
    });
  }

  function findRowNumber(rangeA1, id) {
    return valuesGet(rangeA1).then(function (data) {
      var rows = data.values || [];
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]) === String(id)) return i + 2;
      }
      return -1;
    });
  }

  function saveClothes(item) {
    if (!item || !String(item['名稱'] || '').trim()) return Promise.reject(new Error(uiMsg('請填寫名稱', 'Please enter a name')));
    if (item['編號']) {
      return findRowNumber(SHEETS.clothes + '!A2:A', item['編號']).then(function (row) {
        if (row < 0) throw new Error(uiMsg('找不到這件衣服', 'Could not find this item'));
        return valuesUpdate(SHEETS.clothes + '!A' + row + ':M' + row, [itemToRow(item)]);
      }).then(getWardrobe);
    }
    return getWardrobe().then(function (data) {
      item['編號'] = nextId(data.clothes, 'C');
      if (!item['狀態']) item['狀態'] = '可穿';
      return valuesAppend(SHEETS.clothes + '!A:M', [itemToRow(item)]).then(getWardrobe);
    });
  }

  function deleteClothes(id) {
    return findRowNumber(SHEETS.clothes + '!A2:A', id).then(function (row) {
      if (row < 0) throw new Error(uiMsg('找不到這件衣服', 'Could not find this item'));
      return deleteRow(SHEETS.clothes, row);
    }).then(getWardrobe);
  }

  function markWorn(id) {
    return findRowNumber(SHEETS.clothes + '!A2:A', id).then(function (row) {
      if (row < 0) throw new Error(uiMsg('找不到這件衣服', 'Could not find this item'));
      return valuesUpdate(SHEETS.clothes + '!L' + row + ':L' + row, [[todayHK()]]);
    }).then(getWardrobe);
  }

  function saveOutfit(outfit) {
    if (!outfit || !String(outfit['名稱'] || '').trim()) return Promise.reject(new Error(uiMsg('請填寫搭配名稱', 'Please enter an outfit name')));
    var ids = outfit['衣服編號'] || '';
    if (Object.prototype.toString.call(ids) === '[object Array]') ids = ids.join(',');
    if (outfit['編號']) {
      return findRowNumber(SHEETS.outfits + '!A2:A', outfit['編號']).then(function (row) {
        if (row < 0) throw new Error(uiMsg('找不到這個搭配', 'Could not find this outfit'));
        return valuesGet(SHEETS.outfits + '!F' + row + ':F' + row).then(function (existing) {
          var date = (existing.values && existing.values[0] && existing.values[0][0]) || todayHK();
          return valuesUpdate(SHEETS.outfits + '!A' + row + ':F' + row, [[
            outfit['編號'], outfit['名稱'] || '', outfit['場合'] || '', ids, outfit['備註'] || '', date
          ]]);
        });
      }).then(getWardrobe);
    }
    return getWardrobe().then(function (data) {
      var newId = nextId(data.outfits, 'O');
      return valuesAppend(SHEETS.outfits + '!A:F', [[newId, outfit['名稱'] || '', outfit['場合'] || '', ids, outfit['備註'] || '', todayHK()]]).then(getWardrobe);
    });
  }

  function deleteOutfit(id) {
    return findRowNumber(SHEETS.outfits + '!A2:A', id).then(function (row) {
      if (row < 0) throw new Error(uiMsg('找不到這個搭配', 'Could not find this outfit'));
      return deleteRow(SHEETS.outfits, row);
    }).then(getWardrobe);
  }

  var methods = {
    getWardrobe: getWardrobe,
    saveClothes: saveClothes,
    deleteClothes: deleteClothes,
    markWorn: markWorn,
    saveOutfit: saveOutfit,
    deleteOutfit: deleteOutfit
  };

  function runApps(fn, args) {
    return new Promise(function (resolve, reject) {
      var runner = google.script.run.withSuccessHandler(resolve).withFailureHandler(function (err) { reject(err); });
      runner[fn].apply(runner, args);
    });
  }

  function run(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (hasAppsScript()) return runApps(fn, args);
    if (cfg().CLIENT_ID) {
      return signIn().then(function () {
        if (!methods[fn]) return Promise.reject(new Error(uiMsg('未知的操作', 'Unknown action')));
        return methods[fn].apply(null, args);
      });
    }
    return Promise.reject(new Error(uiMsg('尚未設定 Google 登入，無法連到你的衣櫃資料表。', 'Google sign-in is not set up, so the closet spreadsheet cannot be reached.')));
  }

  global.WardrobeAPI = {
    run: run,
    init: init,
    signIn: signIn,
    signOut: signOut,
    isSignedIn: isSignedIn,
    needsGoogleSignIn: needsGoogleSignIn,
    hasAppsScript: hasAppsScript,
    todayHK: todayHK
  };
})(window);
