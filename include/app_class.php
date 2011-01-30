<?php

/*
  Copyright (c) 2005 James Baicoianu

  This library is free software; you can redistribute it and/or
  modify it under the terms of the GNU Lesser General Public
  License as published by the Free Software Foundation; either
  version 2.1 of the License, or (at your option) any later version.

  This library is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
  Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General Public
  License along with this library; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 */

include_once("lib/logger.php");
include_once("lib/profiler.php");
include_once("include/common_funcs.php");
include_once("lib/Conteg_class.php");

class App {

  function App($rootdir, $args) {
    Profiler::StartTimer("WebApp", 1);
    Profiler::StartTimer("WebApp::Init", 1);
    Profiler::StartTimer("WebApp::TimeToDisplay", 1);

    ob_start();
    $this->rootdir = $rootdir;
    $this->debug = !empty($args["debug"]);
    $this->getAppVersion();
    Logger::Info("WebApp Initializing (" . $this->appversion . ")");
    Logger::Info("Path: " . get_include_path());
    $this->initAutoLoaders();

    if (class_exists("PandoraLog")) {
      Logger::Info("Turning Pandora flag on");
      $pandora = PandoraLog::singleton();
      $pandora->setFlag(true);
    }


    $this->locations = array("scripts" => "htdocs/scripts",
        "css" => "htdocs/css",
        "tmp" => "tmp",
        "config" => "config");
    $this->request = $this->ParseRequest(NULL, $args);
    $this->locations["basedir"] = $this->request["basedir"];
    $this->locations["scriptswww"] = $this->request["basedir"] . "/scripts";
    $this->locations["csswww"] = $this->request["basedir"] . "/css";
    $this->locations["imageswww"] = $this->request["basedir"] . "/images";

    $this->InitProfiler();

    $this->cfg = ConfigManager::singleton($rootdir);
    $this->data = DataManager::singleton($this->cfg);

    set_error_handler(array($this, "HandleError"), E_ALL);

    DependencyManager::init($this->locations);

    if ($this->initialized()) {
      try {
        $this->session = SessionManager::singleton();
        // Set sticky debug flag
        if (isset($this->request["args"]["debug"])) {
          $this->debug = $_SESSION["debug"] = ($this->request["args"]["debug"] == 1);
        } else if (!empty($_SESSION["debug"])) {
          $this->debug = $_SESSION["debug"];
        }
        $this->cobrand = $this->GetRequestedConfigName($this->request);
        if (isset($this->request["args"]["_role"])) {
          $this->role = $this->request["args"]["_role"];
        } else if (isset($this->cfg->servers["role"])) {
          $this->role = $this->cfg->servers["role"];
        } else {
          $this->role = "dev";
        }
        $this->cfg->GetConfig($this->cobrand, true, $this->role);
        $this->ApplyConfigOverrides();

        // And the google analytics flag
        if (isset($this->request["args"]["GAalerts"])) {
          $this->GAalerts = $this->session->temporary["GAalerts"] = ($this->request["args"]["GAalerts"] == 1) ? 1 : 0;
        } else if (!empty($this->session->temporary["GAalerts"])) {
          $this->GAalerts = $this->session->temporary["GAalerts"];
        } else {
          $this->GAalerts = 0;
        }

        $this->apiversion = (isset($this->request["args"]["apiversion"]) ? $this->request["args"]["apiversion"] : ConfigManager::get("api.version.default", 0));
        $this->tplmgr = TemplateManager::singleton($this->rootdir);
        $this->tplmgr->assign_by_ref("webapp", $this);
        $this->components = ComponentManager::singleton($this);
        $this->orm = OrmManager::singleton();
        //$this->tplmgr->SetComponents($this->components);
      } catch (Exception $e) {
        print $this->HandleException($e);
      }
    } else {
      $fname = "./templates/uninitialized.tpl";
      if (($path = file_exists_in_path($fname, true)) !== false) {
        print file_get_contents($path . "/" . $fname);
      }
    }
    $this->user = User::singleton();
    $this->user->InitActiveUser($this->request);

    // Merge permanent user settings from the URL
    if (!empty($this->request["args"]["settings"])) {
      foreach ($this->request["args"]["settings"] as $k=>$v) {
        $this->user->SetPreference($k, $v, "user");
      }
    }
    // ...and then do the same for session settings
    if (!empty($this->request["args"]["sess"])) {
      foreach ($this->request["args"]["sess"] as $k=>$v) {
        $this->user->SetPreference($k, $v, "temporary");
      }
    }

    // And finally, initialize abtests
    if (class_exists("ABTestManager")) {
      Profiler::StartTimer("WebApp::Init - abtests", 2);
      $this->abtests = ABTestmanager::singleton(array("cobrand" => $this->cobrand, "v" => $this->request["args"]["v"]));
      Profiler::StopTimer("WebApp::Init - abtests");
    }

    Profiler::StopTimer("WebApp::Init");
  }

  function Display($path=NULL, $args=NULL) {
    $path = any($path, $this->request["path"], "/");
    $args = any($args, $this->request["args"], array());

    if (!empty($this->components)) {
      try {
        $output = $this->components->Dispatch($path, $args);
      } catch (Exception $e) {
        //print_pre($e);
        $output["content"] = $this->HandleException($e);
      }

      $this->session->quit();

      // Load settings from servers.ini
      $contegargs = (isset($this->cfg->servers["conteg"]) ? $this->cfg->servers["conteg"] : array());
      // And also from site config
      $contegcfg = ConfigManager::get("conteg");
      if (is_array($contegcfg)) {
        $contegargs = array_merge($contegargs, $conteg);
      }

      // Merge type-specific policy settings from config if applicable
      if (isset($contegargs["policy"]) && is_array($contegargs["policy"][$output["responsetype"]])) {
        $contegargs = array_merge($contegargs, $contegargs["policy"][$output["responsetype"]]);
      }
      if (empty($contegargs["type"])) {
        $contegargs["type"] = $output["responsetype"];
      }

      if (empty($contegargs["modified"])) { // Set modified time to mtime of base directory if not set
        $contegargs["modified"] = filemtime($this->rootdir);
      }

      //header('Content-type: ' . any($output["type"], "text/html"));
      if ($output["type"] == "ajax" || $output["type"] == "jsonp") {
        print $this->tplmgr->PostProcess($output["content"], true);
      } else {
        print $this->tplmgr->PostProcess($output["content"]);
        if (!empty($this->request["args"]["timing"])) {
          print Profiler::Display();
        }
      }
      Profiler::StopTimer("WebApp::TimeToDisplay");
      new Conteg($contegargs);
    }
  }

  function GetAppVersion() {
    $this->appversion = "development";
    $verfile = "config/elation.appversion";
    if (file_exists($verfile)) {
      $appver = trim(file_get_contents($verfile));
      if (!empty($appver))
        $this->appversion = $appver;
    }
    return $this->appversion;
  }

  function initialized() {
    $ret = false;
    if (is_writable($this->locations["tmp"])) {
      if (!file_exists($this->locations["tmp"] . "/initialized.txt")) {
        umask(0002);
        Logger::notice("App instance has not been initialized yet - doing so now");
        if (extension_loaded("apc")) {
          Logger::notice("Flushing APC cache");
          apc_clear_cache();
        }

        // Create required directories for program execution
        if (!file_exists($this->locations["tmp"] . "/compiled/"))
          mkdir($this->locations["tmp"] . "/compiled/", 02775);

        $ret = touch($this->locations["tmp"] . "/initialized.txt");
      } else {
        $ret = true;
      }
    }
    return $ret;
  }

  function ParseRequest($page=NULL, $args=NULL) {
    $ret = array();
    //$scriptname = array_shift($req);
    //$component = array_shift($req);
    //$ret["path"] = "/" . str_replace(".", "/", $component);
    if ($page === NULL)
      $page = $_SERVER["SCRIPT_URL"];
    $ret["path"] = "/";
    $ret["type"] = "commandline";
    $ret["user_agent"] = "commandline";

    if (!empty($args)) {
      $ret["args"] = $args;
    }
    return $ret;
  }

  function HandleException($e) {
    $vars["exception"] = array("type" => "exception",
        "message" => $e->getMessage(),
        "file" => $e->getFile(),
        "line" => $e->getLine(),
        "trace" => $e->getTrace());
    $user = User::singleton();
    $vars["debug"] = ($this->debug || $user->HasRole("ADMIN"));
    if (($path = file_exists_in_path("templates/exception.tpl", true)) !== false) {
      return $this->tplmgr->GetTemplate($path . "/templates/exception.tpl", $this, $vars);
    }
    return "Unhandled Exception (and couldn't find exception template!)";
  }

  function HandleError($errno, $errstr, $errfile, $errline, $errcontext) {
    if ($errno & error_reporting()) {
      if ($errno & E_ERROR || $errno & E_USER_ERROR)
        $type = "error";
      else if ($errno & E_WARNING || $errno & E_USER_WARNING)
        $type = "warning";
      else if ($errno & E_NOTICE || $errno & E_USER_NOTICE)
        $type = "notice";
      else if ($errno & E_PARSE)
        $type = "parse error";

      $vars["exception"] = array("type" => $type,
          "message" => $errstr,
          "file" => $errfile,
          "line" => $errline);

      $user = User::singleton();
      $vars["debug"] = ($this->debug || $user->HasRole("ADMIN"));
      if ($vars["debug"]) {
        $vars["exception"]["trace"] = debug_backtrace();
        array_shift($vars["exception"]["trace"]);
      }

      //$vars['dumpedException'] = var_export($vars['exception'], true);

      if (isset($this->tplmgr) && ($path = file_exists_in_path("templates/exception.tpl", true)) !== false) {
        print $this->tplmgr->GetTemplate($path . "/templates/exception.tpl", $this, $vars);
      } else {
        print "<blockquote><strong>" . $type . ":</strong> " . $errstr . "</blockquote> <address>" . $vars["exception"]["file"] . ":" . $vars["exception"]["line"] . "</address>";
      }
    }
  }

  protected function initAutoLoaders() {
    if (class_exists('Zend_Loader_Autoloader', false)) {
      $zendAutoloader = Zend_Loader_Autoloader::getInstance(); //already registers Zend as an autoloader
      $zendAutoloader->unshiftAutoloader(array('WebApp', 'autoloadElation')); //add the Elation autoloader
    } else {
      spl_autoload_register('App::autoloadElation');
    }
  }

  public static function autoloadElation($class) {
//    print "$class <br />";

    if (file_exists_in_path("include/" . strtolower($class) . "_class.php")) {
      require_once("include/" . strtolower($class) . "_class.php");
    } else if (file_exists_in_path("include/model/" . strtolower($class) . "_class.php")) {
      require_once("include/model/" . strtolower($class) . "_class.php");
    } else if (file_exists_in_path("include/Smarty/{$class}.class.php")) {
      require_once("include/Smarty/{$class}.class.php");
    } else {
      try {
        if (class_exists('Zend_Loader', false)) {
          @Zend_Loader::loadClass($class); //TODO: for fucks sake remove the @ ... just a tmp measure while porting ... do it or i will chum kiu you!
        }
        return;
      } catch (Exception $e) {
        
      }
    }
  }

  public function InitProfiler() {
    // If timing parameter is set, force the profiler to be on
    $timing = any($this->request["args"]["timing"], $this->cfg->servers["profiler"]["level"], 0);

    if (!empty($this->cfg->servers["profiler"]["percent"])) {
      if (rand() % 100 < $this->cfg->servers["profiler"]["percent"]) {
        $timing = 4;
        Profiler::$log = true;
      }
    }

    if (!empty($timing)) {
      Profiler::$enabled = true;
      Profiler::setLevel($timing);
    }
  }

  function GetRequestedConfigName($req=NULL) {
    $ret = "thefind";

    if (empty($req))
      $req = $this->request;

    if (!empty($req["args"]["cobrand"]) && is_string($req["args"]["cobrand"])) {
      $ret = $req["args"]["cobrand"];
      $_SESSION["temporary"]["cobrand"] = $ret;
    } else if (!empty($_SESSION["temporary"]["cobrand"])) {
      $ret = $_SESSION["temporary"]["cobrand"];
    }

    Logger::Info("Requested config is '$ret'");
    return $ret;
  }


  function ApplyConfigOverrides() {
    if(!empty($this->request["args"]["sitecfg"])) {
      $tmpcfg = array();
      array_set_multi($tmpcfg, $this->request["args"]["sitecfg"]); // FIXME - can't we just array_set_multi() on $this->sitecfg directly?
      ConfigManager::merge($tmpcfg);
    }

    if(!empty($this->request["args"]["cobrandoverride"])) {
      $included_config =& $this->cfg->GetConfig($this->request["args"]["cobrandoverride"], false, $this->role);
      if (!empty($included_config))
        ConfigManager::merge($included_config);
    }
    $rolecfg = ConfigManager::get("roles.{$this->role}.options");
    if (!empty($rolecfg)) {
      Logger::Info("Using overridden role cfg 'roles.{$this->role}'");
      ConfigManager::merge($rolecfg);
    }

    $browseroverride = NULL;
    if (isset($this->request["args"]["sess"]["browser.override"])) {
      $browseroverride = $this->request["args"]["sess"]["browser.override"];
    } else if (isset($_SESSION["temporary"]["user"]["preferences"]["browser"]["override"])) {
      $browseroverride = $_SESSION["temporary"]["user"]["preferences"]["browser"]["override"];
    }
    if ($browseroverride !== NULL)
      $this->request["browser"] = $browseroverride;

    if(!empty($this->request["browser"])) {
      $included_config =& ConfigManager::get("browsers.{$this->request['browser']}.options");
      if (!empty($included_config["include"])) { // These includes sure do get hairy.  This allows for browsers.*.options.include to call in different classes
        $includes = explode(",", $included_config["include"]);
        foreach ($includes as $include) {
          $subincluded_config =& $this->cfg->GetConfig($include, false, $this->cfg->servers["role"]);
          if (!empty($subincluded_config))
            ConfigManager::merge($subincluded_config);
        }
        unset($included_config["include"]);
      }

      if (!empty($included_config))
        ConfigManager::merge($included_config);
    }
  }
}
