const del                           = require('del');
const fs                            = require('fs-extra');
const fssimple                      = require('fs');
const path                          = require('path');
const pathHelper                    = require('../../utils/path-helper');
const configurationDataProvider     = require('../../app-prefs-state/configuration-data-provider')
const InitialWorkspaceConfigBuilder = require('../workspace/initial-workspace-config-builder');
const hugoUtils                     = require('./../../hugo/hugo-utils');

/*

This service class containes utility functions for creating and manipulating unmounted sites

*/

class LibraryService{


  async getSiteConf(siteKey){
    return new Promise((resolve, reject) => {

      configurationDataProvider.get(function(err, data){
        if(err){
          reject(err);
        }
        else {
          let site = data.sites.find((x)=>x.key===siteKey);

          if(site){
            resolve(site);
          }
          else{
            reject(new Error(`Could not find siteconf with sitekey ${siteKey}`));
          }
        }
      }, {invalidateCache: true});
    });
  }

  async checkDuplicateSiteConfAttrStringValue(attr, value){
    return new Promise((resolve, reject) => {

      configurationDataProvider.get(function(err, data){
        if(err){
          reject(err);
        }
        else {
          let duplicate;
          let response;

          duplicate = data.sites.find((x)=>x[attr].toLowerCase() === value.toLowerCase());
          if(duplicate){
            response = true;
          }
          else{
            response = false;
          }

          resolve(response);
        }
      }, {invalidateCache: false});
    });
  }

  async createNewHugoQuiqrSite(siteName, hugoVersion, configFormat){
    return new Promise(async (resolve, reject) => {

      try{
        const siteKey = await this.createSiteKeyFromName(siteName);

        const pathSite = pathHelper.getSiteRoot(siteKey);
        await fs.ensureDir(pathSite);

        const pathSource = path.join(pathHelper.getSiteRoot(siteKey), "main");
        await hugoUtils.createSiteDir(pathSource, siteName, configFormat);

        let configBuilder = new InitialWorkspaceConfigBuilder(pathSource);
        configBuilder.buildAll(hugoVersion);

        let newConf = this.createMountConfUnmanaged(siteKey, siteKey, pathSource);
        await fssimple.writeFileSync(pathHelper.getSiteMountConfigPath(siteKey), JSON.stringify(newConf), { encoding: "utf8"});
        resolve(siteKey);
      }
      catch(err){
        reject(err)
      }

    });
  }

  async createSiteKeyFromName(name){
    return new Promise((resolve, reject) => {

      let newKey = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();

      this.checkDuplicateSiteConfAttrStringValue('key', newKey)
        .then((duplicate)=>{
          if(duplicate){
            newKey = newKey + '-' + pathHelper.randomPathSafeString(4);
          }
          resolve(newKey);
        })
        .catch((err)=>{
          reject(err);
        })


    });
  }


  createMountConfUnmanaged(siteKey, siteName, pathSource){
    let newConf = {};
    newConf.key = siteKey;
    newConf.name = siteName;
    newConf.source = {};
    newConf.source.type = 'folder';
    newConf.source.path = path.basename(pathSource); // 30sep2024, always relative from now on
    newConf.publish = [];
    newConf.lastPublish = 0;
    return newConf;
  }

  async createNewSiteWithTempDirAndKey(siteKey, tempDir){

    const pathSite = pathHelper.getSiteRoot(siteKey);
    const pathSource = path.join(pathHelper.getSiteRoot(siteKey), "main");

    await fs.ensureDir(pathSite);
    await fs.moveSync(tempDir, pathSource);

    let newConf = this.createMountConfUnmanaged(siteKey, siteKey, pathSource);
    await fssimple.writeFileSync(pathHelper.getSiteMountConfigPath(siteKey), JSON.stringify(newConf), { encoding: "utf8"});
  }

  // REMOVE INVALID KEYS
  deleteInvalidConfKeys(newConf){
    delete newConf['configPath']
    delete newConf['owner']
    delete newConf['published']
    delete newConf['publishKey']
    delete newConf['etalage']

    return newConf;
  }

  async writeSiteConf(newConf, siteKey){
    newConf = this.deleteInvalidConfKeys(newConf);
    await fssimple.writeFileSync(pathHelper.getSiteMountConfigPath(siteKey), JSON.stringify(newConf), { encoding: "utf8"});
    return true;
  }

  async deleteSite(siteKey){
    return new Promise(async (resolve, reject) => {
      try{
        fs.remove(pathHelper.getSiteMountConfigPath(siteKey));
        del.sync([pathHelper.getSiteRoot(siteKey)],{force:true});
        resolve();
      }
      catch(err){
        reject(err)
      }

    });
  }



}

module.exports = new LibraryService;
