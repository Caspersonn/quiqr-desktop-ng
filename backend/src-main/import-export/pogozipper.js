const electron             = require('electron')
const dialog               = electron.dialog;
const fs                   = require('fs-extra');
const fssimple             = require('fs');
const AdmZip               = require('adm-zip');
const pathHelper           = require('../utils/path-helper');
const fileDirUtils         = require('../utils/file-dir-utils');
const outputConsole        = require('../logger/output-console');

const PogoSiteExtension    = "pogosite";
const PogoThemeExtension   = "pogotheme";
const PogoContentExtension = "pogocontent";

const mainWindow           = global.mainWindow;

class Pogozipper{

    async exportSite() {

        if(!this.checkCurrentSiteKey()) {return;}

        const prompt = require('electron-prompt');
        var newKey = await prompt({
            title: 'Enter site key',
            label: 'key:',
            value: global.currentSiteKey,
            inputAttrs: {
                type: 'text',
                required: true
            },
            type: 'input'
        }, mainWindow);

        if(!newKey || newKey===""){
            return;
        }

        let dirs = dialog.showOpenDialog(mainWindow,
            { properties: ['openDirectory'] });
        if (!dirs || dirs.length != 1) {
            return;
        }

        let path = dirs[0];
        let tmppath = path.join(pathHelper.getRoot() , 'sites', global.currentSiteKey , 'exportTmp');

        await fileDirUtils.recurForceRemove(tmppath);

        fs.copySync(global.currentSitePath, tmppath);
        console.log("copied to temp dir");

        await fileDirUtils.recurForceRemove(path.join(tmppath , '.git'));
        await fileDirUtils.recurForceRemove(path.join(tmppath , 'public'));
        await fileDirUtils.recurForceRemove(path.join(tmppath , 'resources'));
        await fileDirUtils.fileRegexRemove(tmppath, /sitekey$/);
        await fileDirUtils.fileRegexRemove(tmppath, /config.*.json/);
        await fileDirUtils.fileRegexRemove(tmppath, /.gitignore/);
        await fileDirUtils.fileRegexRemove(tmppath, /.gitlab-ci.yml/);
        await fileDirUtils.fileRegexRemove(tmppath, /.gitmodules/);
        await fileDirUtils.fileRegexRemove(tmppath, /.DS_Store/);

        let configJsobPath = pathHelper.getSiteMountConfigPath(global.currentSiteKey);
        const conftxt = fssimple.readFileSync(configJsobPath, {encoding:'utf8', flag:'r'});
        var newConf = JSON.parse(conftxt);
        console.log("read and parsed conf file");
        newConf.key = newKey;
        newConf.name = newKey;
        var newConfJson = JSON.stringify(newConf);

        var zip = new AdmZip();
        await zip.addFile("sitekey", Buffer.alloc(newKey.length, newKey), "");
        await zip.addFile('config.'+newKey+'.json', Buffer.alloc(newConfJson.length, newConfJson), "");

        await zip.addLocalFolder(tmppath);
        //var willSendthis = zip.toBuffer();

        var exportFilePath = path+"/"+newKey+"."+PogoSiteExtension;
        await zip.writeZip(exportFilePath);

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ["Close"],
            title: "Finished site export",
            message: "Check" + exportFilePath,
        });
    }

    async importSite(path=null) {


        if(!path){
            let files = dialog.showOpenDialog(mainWindow, {
                filters: [
                    { name: "Quiqr Sites", extensions: [PogoSiteExtension] }
                ],
                properties: ['openFile'] });

            if (!files || files.length != 1) {
                return;
            }
            path = files[0];
        }
        else {
            let filename = path.split('/').pop();
            let options  = {
                buttons: ["Yes","Cancel"],
                message: "You're about to import the site "+filename+". Do you like to continue?"
            }
            let response = dialog.showMessageBox(options)
            if(response === 1) return;
        }

        var zip = new AdmZip(path);
        var zipEntries = zip.getEntries();
        var siteKey = "";

        await zipEntries.forEach(function(zipEntry) {
            if (zipEntry.entryName == "sitekey") {
                siteKey = zip.readAsText("sitekey");
                console.log("found sitekey:" + siteKey);
            }
        });

        if(siteKey==""){
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ["Close"],
                message: "Failed to import site. Invalid site file 1, no siteKey",
                title: "Failed task",
            });
            return;
        }

        outputConsole.appendLine('Found a site with key ' + siteKey);

        var confFileName = "config."+siteKey+".json";
        var conftxt = zip.readAsText(confFileName);
        if(!conftxt){
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ["Close"],
                title: "Failed task",
                message: "Failed to import site. Invalid site file. 2, unreadable config."+siteKey+".json",
            });
            return;
        }

        var todayDate = new Date().toISOString().replace(':','-').replace(':','-').slice(0,-5);
        var pathSite = path.join(pathHelper.getRoot(),"sites",siteKey);
        var pathSiteSources = path.join(pathHelper.getRoot(), "sites", siteKey, "sources");
        var pathSource = path.join(pathSiteSources, siteKey+"-"+todayDate);
        await fs.ensureDir(pathSite);
        await fs.ensureDir(pathSiteSources);
        await fs.ensureDir(pathSource);

        var newConf = JSON.parse(conftxt);
        newConf.source.path = pathSource;

        let newConfigJsobPath = pathHelper.getSiteMountConfigPath(siteKey);
        await fssimple.writeFileSync(newConfigJsobPath, JSON.stringify(newConf), { encoding: "utf8"});

        outputConsole.appendLine('wrote new site configuration');
        await zip.extractAllTo(pathSource, true);

        await fs.removeSync(pathSource+'/'+confFileName);

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ["Close"],
            title: "Finished task",
            message: "Site has been imported.",
        });

        global.mainWM.closeSiteAndShowSelectSites();

    }

    async importTheme(path=null) {

        //stop server
        //stop preview

        if(!this.checkCurrentSiteKey()) {return;}

        if(!path){
            let files = dialog.showOpenDialog(mainWindow, {
                filters: [
                    { name: "Quiqr Themes", extensions: [PogoThemeExtension] }
                ],
                properties: ['openFile'] });

            if (!files || files.length != 1) {
                return;
            }
            path = files[0];
        }
        else {
            let filename = path.split('/').pop();
            let options  = {
                buttons: ["Yes","Cancel"],
                message: "You're about to import the theme "+filename+" into "+ global.currentSiteKey +". Do you like to continue?"
            }
            let response = dialog.showMessageBox(options)
            if(response === 1) return;
        }

        var zip = new AdmZip(path);
        var zipEntries = zip.getEntries();
        var siteKey = "";

        await zipEntries.forEach(function(zipEntry) {
            if (zipEntry.entryName == "sitekey") {
                siteKey = zip.readAsText("sitekey");
                console.log("found sitekey:" + siteKey);
            }
        });

        if(siteKey == ""){
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ["Close"],
                title: "Failed task",
                message: "failed to import site. invalid site file 1, no sitekey",
            });
            return;
        }

        if(siteKey != global.currentSiteKey){
            let options  = {
                buttons: ["Yes","Cancel"],
                message: "The Sitekey of the themefile does not match. Do you like to continue?"
            }
            let response = dialog.showMessageBox(options)
            if(response === 1) return;
        }

        outputConsole.appendLine('Found a site with key ' + siteKey);

        await fileDirUtils.recurForceRemove(global.currentSitePath + '/themes');
        await zip.extractAllTo(global.currentSitePath, true);
        //await fs.removeSync(global.currentSitePath+'/'+confFileName);

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ["Close"],
            message: "Theme has been imported.",
            title: "Finished task",
        });
    }

    checkCurrentSiteKey(){

        if(global.currentSiteKey){
            return true;
        }
        else {
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ["Close"],
                title: "Warning",
                message: "First, you need to select a site.",
            });
            return;
        }

    }

    async exportTheme() {

        if(!this.checkCurrentSiteKey()) {return;}

        let dirs = dialog.showOpenDialog(mainWindow,
            { properties: ['openDirectory'] });
        if (!dirs || dirs.length != 1) {
            return;
        }

        let path = dirs[0];
        let tmppath = path.join(pathHelper.getRoot() , 'sites', global.currentSiteKey, 'exportTmp');

        await fileDirUtils.recurForceRemove(tmppath);

        fs.copySync(global.currentSitePath, tmppath);
        console.log("copied to temp dir");

        await fileDirUtils.recurForceRemove(path.join(tmppath , '.git'));
        await fileDirUtils.recurForceRemove(path.join(tmppath , 'public'));
        await fileDirUtils.recurForceRemove(path.join(tmppath , 'content'));
        await fileDirUtils.recurForceRemove(path.join(tmppath , 'static'));
        await fileDirUtils.recurForceRemove(path.join(tmppath , 'archetypes'));
        await fileDirUtils.recurForceRemove(path.join(tmppath , 'resources'));
        await fileDirUtils.recurForceRemove(path.join(tmppath , 'layouts'));
        await fileDirUtils.recurForceRemove(path.join(tmppath , 'data'));
        await fileDirUtils.fileRegexRemove(tmppath, /sitekey$/);
        await fileDirUtils.fileRegexRemove(tmppath, /config.*.json/);
        await fileDirUtils.fileRegexRemove(tmppath, /.gitignore/);
        await fileDirUtils.fileRegexRemove(tmppath, /.gitlab-ci.yml/);
        await fileDirUtils.fileRegexRemove(tmppath, /.gitmodules/);
        await fileDirUtils.fileRegexRemove(tmppath, /.DS_Store/);

        var zip = new AdmZip();

        await zip.addFile("sitekey", Buffer.alloc(global.currentSiteKey.length, global.currentSiteKey), "");

        await zip.addLocalFolder(tmppath);
        //var willSendthis = zip.toBuffer();

        var exportFilePath = path+"/"+global.currentSiteKey+"."+PogoThemeExtension;
        await zip.writeZip(exportFilePath);

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ["Close"],
            message: "Finished theme export. Check" + exportFilePath,
            title: "Finished task",
        });

    }

    async exportContent() {

        if(!this.checkCurrentSiteKey()) {return;}

        let dirs = dialog.showOpenDialog(mainWindow,
            { properties: ['openDirectory'] });
        if (!dirs || dirs.length != 1) {
            return;
        }

        let path = dirs[0];
        let tmppath = path.join(pathHelper.getRoot() , 'sites', global.currentSiteKey , 'exportTmp');

        await fileDirUtils.recurForceRemove(tmppath);

        fs.copySync(global.currentSitePath, tmppath);
        console.log("copied to temp dir");

        await fileDirUtils.recurForceRemove(tmppath + '/.git');
        await fileDirUtils.recurForceRemove(tmppath + '/public');
        await fileDirUtils.recurForceRemove(tmppath + '/themes');
        await fileDirUtils.recurForceRemove(tmppath + '/archetypes');
        await fileDirUtils.recurForceRemove(tmppath + '/resources');
        await fileDirUtils.recurForceRemove(tmppath + '/layouts');
        await fileDirUtils.fileRegexRemove(tmppath, /sitekey$/);
        await fileDirUtils.fileRegexRemove(tmppath, /config.*.json/);
        await fileDirUtils.fileRegexRemove(tmppath, /config.toml/);
        await fileDirUtils.fileRegexRemove(tmppath, /config.yaml/);
        await fileDirUtils.fileRegexRemove(tmppath, /config.json/);
        await fileDirUtils.fileRegexRemove(tmppath, /.gitignore/);
        await fileDirUtils.fileRegexRemove(tmppath, /.gitlab-ci.yml/);
        await fileDirUtils.fileRegexRemove(tmppath, /sukoh.yml/);
        await fileDirUtils.fileRegexRemove(tmppath, /.gitmodules/);
        await fileDirUtils.fileRegexRemove(tmppath, /.DS_Store/);

        var zip = new AdmZip();

        await zip.addFile("sitekey", Buffer.alloc(global.currentSiteKey.length, global.currentSiteKey), "");

        await zip.addLocalFolder(tmppath);
        //var willSendthis = zip.toBuffer();

        var exportFilePath = path+"/"+global.currentSiteKey+"."+PogoContentExtension;
        await zip.writeZip(exportFilePath);

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ["Close"],
            title: "Finished task",
            message: "Finished content export. Check" + exportFilePath,
        });
    }

    async importContent(path){
        //stop server
        //stop preview

        if(!this.checkCurrentSiteKey()) {return;}

        if(!path){
            let files = dialog.showOpenDialog(mainWindow, {
                filters: [
                    { name: "Quiqr Content", extensions: [PogoContentExtension] }
                ],
                properties: ['openFile'] });

            if (!files || files.length != 1) {
                return;
            }
            path = files[0];
        }
        else {
            let filename = path.split('/').pop();
            let options  = {
                buttons: ["Yes","Cancel"],
                message: "You're about to import the content "+filename+" into "+ global.currentSiteKey +". Do you like to continue?"
            }
            let response = dialog.showMessageBox(options)
            if(response === 1) return;
        }

        var zip = new AdmZip(path);
        var zipEntries = zip.getEntries();
        var siteKey = "";

        await zipEntries.forEach(function(zipEntry) {
            if (zipEntry.entryName == "sitekey") {
                siteKey = zip.readAsText("sitekey");
                console.log("found sitekey:" + siteKey);
            }
        });

        if(siteKey == ""){
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ["Close"],
                title: "Failed task",
                message: "failed to import site. invalid site file 1, no sitekey",
            });
            return;
        }

        if(siteKey != global.currentSiteKey){
            let options  = {
                buttons: ["Yes","Cancel"],
                message: "The Sitekey of the contentfile does not match. Do you like to continue?"
            }
            let response = dialog.showMessageBox(options)
            if(response === 1) return;
        }

        outputConsole.appendLine('Found a site with key ' + siteKey);

        await fileDirUtils.recurForceRemove(global.currentSitePath + '/content');
        await zip.extractAllTo(global.currentSitePath, true);

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ["Close"],
            title: "Finished task",
            message: "Content has been imported.",
        });
    }



}

module.exports = new Pogozipper();
