var elation = new function() {
  this.extend = function(name, func) {
		var ptr = this,
				parts = name.split("."),
				i;
		
		for (i = 0; i < parts.length-1; i++) {
			if (typeof ptr[parts[i]] == 'undefined')
				ptr[parts[i]] = {};
			
			ptr = ptr[parts[i]];
		}
		
		ptr[parts[i]] = func;
  }
}

// FIXME: need to do this the right way, but sick of all these errors
$TF = $;

elation.extend("component", new function() {
  this.namespace = "elation";
  this.registry = [];
  this.init = function() {
    var componentattr = "component";
    var argsattr = this.namespace+':args';
    // Find all elements which have a namespace:componentattr attribute

    //var elements = $("["+this.namespace+"\\:"+componentattr+"]"); 
		/*
    function nsresolver(prefix) {  
      var ns = {  
        'xhtml' : 'http://www.w3.org/1999/xhtml',  
        'elation': 'http://www.ajaxelation.com/xmlns'  
      };  
			alert(ns[prefix]);
      return ns[prefix] || null;  
    }  
		*/
		
    var nsresolver = document.createNSResolver(document.documentElement);
		
		// FIXME - I've started work to switch this over to use xpath selectors instead of jquery but namespaces make it a pain
		//         Right now this is just selecting all elements, very inefficient...
		//var selector = '//*['+this.namespace+':'+componentattr+']';
		//var selector = "//*[@*["+this.namespace+":"+componentattr+"]]";
		//var selector = "//*[@*[namespace-uri()='http://www.ajaxelation.com/xmlns']]";
		//var selector = "//*[local-name()='component']";
		var selector = "//*";
		
    var result = document.evaluate(selector, document, nsresolver, XPathResult.ANY_TYPE, null);
    var elements = [];
    while (element = result.iterateNext()) {
      elements.push(element);
    }
		console.log('i init now');
    for (var i = 0; i < elements.length; i++) {
      var element = elements[i];
      var componenttype = element.getAttribute(this.namespace+':'+componentattr);
      var componentname = element.getAttribute(this.namespace+':name') || element.id;
      if (componenttype) {
        var componentargs = {}, j;
        // First look for a JSON-encoded args array in the element's direct children
        for (j = 0; j < element.children.length; j++) {
          if (element.children[j].nodeName == argsattr.toUpperCase()) {
            try {
              componentargs = JSON.parse(element.children[j].innerHTML);
              break; // only one args array per block, bail out when we find one so we don't waste time with the rest
            } catch(e) {
              // Probably JSON syntax error
              console.log("Could not parse " + argsattr + ": " + element.children[j].innerHTML);
            }
          }
        }
        // Then, loop through the attributes and parse out any individual arguments which can be specified as attributes
        for (j = 0; j < element.attributes.length; j++) {
          if (element.attributes[j].nodeName.substring(0, argsattr.length+1) == argsattr+'.') {
            componentargs[element.attributes[j].nodeName.substring(argsattr.length+1)] = element.attributes[j].nodeValue;
          }
        }
        // Instantiate the new component with all parsed arguments
        //elation.component.create(componenttype, element, componentargs);
        var componentclass = elation.utils.arrayget(elation, componenttype);
        if (typeof componentclass == 'function') {
          componentclass(componentname, element, componentargs);
        } 
      }
    }
  }
  this.add = function(name, classdef) {
    // At the top level, a component is just a function which checks to see if
    // an instance with the given name exists already.  If it doesn't we create
    // it, and then we return a reference to the specified instance.
    var el = function(name, container, args) {
      if (!name && name !== 0) // If no name was passed, use the current object count as a name instead ("anonymous" components)
        name = el.objcount;
      if (!el.obj[name]) {
        el.obj[name] = new el.fn.init(name, container, args);
        el.objcount++;
      }
      return el.obj[name];
    };
    el.objcount = 0;
    el.obj = {}; // this is where we store all the instances of this type of component
    el.fn = (typeof classdef == 'function' ? new classdef : classdef); // and this is where we store the functions
    // If no init function is defined, add a default one
    if (!el.fn.init) el.fn.init = function(name, container, args) { 
      this.name = name;
      this.container = container;
      this.args = args;
    }
    el.fn.init.prototype = el.fn; // The functions which were passed in are attached to the insantiable component objects
    elation.extend(name, el); // inject the newly-created component wrapper into the main elation object
  }
});
elation.extend('onloads',new function() {
  this.done = false;
  this.onloads = [];

  this.add = function(expr) {
    this.onloads.push(expr);
  }
  this.init = function() {
    /* for Safari */
    if (/WebKit/i.test(navigator.userAgent)) { // sniff
      this.timer = setInterval(function() {
        if (/loaded|complete/.test(document.readyState)) {
          elation.onloads.execute(); // call the onload handler
        }
      }, 10);
      return;
    }

    /* for Mozilla/Opera9 */
    if (document.addEventListener) {
      document.addEventListener("DOMContentLoaded", elation.onloads.execute, false);
      return;
    }
    /* for Internet Explorer */
    /*@cc_on @*/
    /*@if (@_win32)
     document.write("<scr"+"ipt id=\"__ie_onload\" defer src=\"/blank.fhtml\"><\/scr"+"ipt>");
      var script = document.getElementById("__ie_onload");
      script.onreadystatechange = function() {
        if (this.readyState == "complete") {
          elation.onloads.execute(); // call the onload handler
        }
      };
      return;
    /*@end @*/
    
    window.onload = elation.onloads.execute;
  }
  this.execute = function() {
    // quit if this function has already been called
    if (elation.onloads.done) return;

    // flag this function so we don't do the same thing twice
    elation.onloads.done = true;

    // kill the timer
    if (elation.onloads.timer) clearInterval(elation.onloads.timer);

    var script = '';
    var expr;
    while (expr = elation.onloads.onloads.shift()) {
      if (typeof expr == 'function') {
        expr(); // FIXME - this causes all function references to be executed before all strings
      } else {
        script += expr + (expr.charAt(expr.length - 1) != ';' ? ';' : '');
      }
    }

    eval(script);
  }
});
elation.onloads.init();

elation.extend("html.dimensions", function(element, ignore_size) {
	if (typeof element != 'object' || element === window) {
		var	width = window.innerWidth		|| document.documentElement.clientWidth		|| document.body.clientWidth,
				height = window.innerHeight	|| document.documentElement.clientHeight	|| document.body.clientHeight;
		
		return {
			0 : width,
			1 : height,
			x : 0,
			y : 0,
			w : width,
			h : height,
			s : elation.html.getscroll()
		};
	}
	
	var width = ignore_size ? 0 : element.offsetWidth,
			height = ignore_size ? 0 : element.offsetHeight,
			left = element.offsetLeft,
			top = element.offsetTop,
      id = element.id || '';
	
	while (element = element.offsetParent) {
		top += element.offsetTop - element.scrollTop;
		left += element.offsetLeft - element.scrollLeft;
	}
	
	if (elation.browser.type == 'safari')
		top += elation.html.getscroll(1);
	
  return {
		0 : left,
		1 : top,
		x : left, 
		y : top, 
		w : width, 
		h : height 
	};
});
elation.extend("html.size", function(obj) {
  return [obj.offsetWidth, obj.offsetHeight];
});
elation.extend("html.position", function(obj) {
  var curleft = curtop = 0;
  if (obj.offsetParent) {
    curleft = obj.offsetLeft;
    curtop = obj.offsetTop;
    while (obj = obj.offsetParent) {
      curleft += obj.offsetLeft;
      curtop += obj.offsetTop;
    }
  }
  return [curleft,curtop];
});

// methods for css classname information and manipulation
elation.extend("html.hasclass", function(element, className) {
  var re = new RegExp("(^| )" + className + "( |$)", "g");
  return element.className.match(re);
});
elation.extend("html.addclass", function(element, className) {
  if (!elation.html.hasclass(element, className)) {
    element.className += " " + className;
  }
});
elation.extend("html.removeclass", function(element, className) {
  var re = new RegExp("(^| )" + className + "( |$)", "g");
  if (element.className.match(re)) {
    element.className = element.className.replace(re, " ");
  }
});
elation.extend("html.toggleclass", function(element, className) {
  if (this.hasclass(element, className))
    this.removeclass(element, className)
  else
    this.addclass(element, className);
});

// for great justice
elation.extend("html.hasClass", elation.html.hasClass);
elation.extend("html.addClass", elation.html.addClass);
elation.extend("html.removeClass", elation.html.removeClass);
elation.extend("html.toggleClass", elation.html.toggleClass);

/* creates a new html element
      example: elation.html.create({ 
        tag:'div', 
        classname:'example',
        style: { width:'30px', height:'20px' },
        attributes: { innerHTML: 'Test!' },
        append: elementObj
      });
*/
elation.extend('html.create', function(parms, classname, style, additional, append, before) {
  if (typeof parms == 'object')
    var tag = parms.tag,
        classname = parms.classname,
        style = parms.style,
        additional = parms.attributes,
        append = parms.append,
        before = parms.before;
  
  var element = document.createElement(tag || parms);
  
  if (classname)
    element.className = classname;
  
  if (style)
    for (var property in style)
      element.style[property] = style[property];
  
  if (additional)
    for (var property in additional)
      element[property] = additional[property];
  
	if (append)
		if (before)
      append.insertBefore(element, before);
    else
      append.appendChild(element);
	
  return element;
});

elation.extend('html.getscroll', function(shpadoinkle) {
  if (elation.iphone && elation.iphone.scrollcontent)
    var pos = [0,0];//elation.iphone.scrollcontent.getPosition();
	else if (typeof pageYOffset != 'undefined') 
		var pos = [ 
			pageXOffset, 
			pageYOffset 
		];
	else 
		var	QuirksObj = document.body,
				DoctypeObj = document.documentElement,		
				element = (DoctypeObj.clientHeight) 
					? DoctypeObj 
					: QuirksObj,
				pos = [ 
					element.scrollLeft, 
					element.scrollTop 
				];

	switch (shpadoinkle) {
		case 0:
			return pos[0];
		
		case 1:
			return pos[1];
		
		default:
			return [ 
				pos[0], 
				pos[1] 
			];
	}
});
elation.extend("html.get_scroll", elation.html.getscroll);
elation.extend("html.getScroll", elation.html.getscroll);

elation.extend("utils.encodeURLParams", function(obj) {
  var value,ret = '';
  
  if (typeof obj == "string") {
    ret = obj;
  } else {
    for (var key in obj) {
      ret += (ret != '' ? '&' : '') + key + '=' + encodeURIComponent(obj[key]); 
    }
  }
  
  return ret;
});

/* Sets value in a multilevel object element 
* args:
* obj -- multilevel object
* element -- 'quoted' object element (as string)
*/
elation.extend("utils.arrayset", function(obj, element, value) {
  var ptr = obj;
  var x = element.split(".");
  for (var i = 0; i < x.length - 1; i++) {
    if (ptr==null || (typeof ptr[x[i]] != 'array' && typeof ptr[x[i]] != 'object' && i != x.length-1)) {
      ptr[x[i]] = {};
    }
    ptr = ptr[x[i]];
  }
  if (typeof ptr == "object") {
    ptr[x[x.length-1]] = value;
  }
});
elation.extend("utils.arrayget", function(obj, name) {
  var ptr = obj;
  var x = name.split(".");
  for (var i = 0; i < x.length; i++) {
    if (ptr==null || (typeof ptr[x[i]] != 'array' && typeof ptr[x[i]] != 'object' && i != x.length-1)) {
      ptr = null;
      break;
    }
    ptr = ptr[x[i]];
  }
  return (typeof ptr == "undefined" ? null : ptr);
});

//Returns true if it is a DOM node
elation.extend("utils.isnode", function(obj) {
  return (
    typeof Node === "object" ? obj instanceof Node : 
    typeof obj === "object" && typeof obj.nodeType === "number" && typeof obj.nodeName==="string"
  );
});

//Returns true if it is a DOM element    
elation.extend("utils.iselement", function(obj) {
  return (
    typeof HTMLElement === "object" ? obj instanceof HTMLElement : //DOM2
    typeof obj === "object" && obj.nodeType === 1 && typeof obj.nodeName==="string"
  );
});
elation.extend("utils.isTrue", function(obj) {
  if (obj == true || obj == 'true') 
    return true;
  
  return false;
});
	
elation.extend("utils.isNull", function(obj) {
  if (obj == null || typeof obj == 'undefined') 
    return true;
  
  return false;
});
	
elation.extend("utils.isEmpty", function(obj) {
  if (obj !== null && 
      obj !== "" && 
      obj !== 0 && 
      typeof obj !== "undefined" && 
      obj !== false) 
    return false;
  
  return true;
});
// runs through direct children of obj and 
// returns the first matching <tag> [className]
elation.extend("utils.getFirstChild", function(obj, tag, className) {
  for (var i=0; i<obj.childNodes.length; i++)
    if (obj.childNodes[i].nodeName == tag.toUpperCase())
      if (className && this.hasclass(obj, className))
        return obj.childNodes[i];
      else if (!className)
        return obj.childNodes[i];
  
  return null;
});

// runs through direct children of obj and 
// returns the last matching <tag> [className]
elation.extend("utils.getLastChild", function(obj, tag, className) {
  for (var i=obj.childNodes.length-1; i>=0; i--)
    if (obj.childNodes[i].nodeName == tag.toUpperCase())
      if (className && this.hasclass(obj, className))
        return obj.childNodes[i];
      else if (!className)
        return obj.childNodes[i];
  
  return null;
});

// runs through all children recursively and returns 
// all elements matching <tag> [className]
elation.extend("utils.getAll", function(obj, tag, className) {
  var	ret = [],
      all = obj.getElementsByTagName(tag);
  
  for (var i=0; i<all.length; i++)
    if (className && this.hasclass(all[i], className))
      ret.push(all[i]);
    else if (!className)
      ret.push(all[i]);
  
  return ret;
});

// runs through the direct children of obj and returns 
// all elements matching <tag> [className]
elation.extend("utils.getOnly", function(obj, tag, className) {
  if (!obj || !tag)
    return;
  
  var ret = [];
  
  for (var i=0; el=obj.childNodes[i]; i++)
    if (el.nodeName == tag.toUpperCase()) {
      if (className && this.hasclass(el, className))
        ret.push(el);
      else if (!className)
        ret.push(el);
    }
  
  return ret;
});

// Navigates up the DOM from a given element looking for match
elation.extend("utils.getParent", function(element, tag, all_occurrences) {
  var ret = [];
  
  while (element && element.nodeName != 'BODY') {
    if (element.nodeName == tag.toUpperCase()) {
      if (all_occurrences)
        ret.push(element);
      else
        return element;
    }
    
    element = element.parentNode;
  }
  
  return (ret.length == 0 ? false : ret);
});

elation.extend("utils.indexOf", function(array, object) {
	if (typeof array == 'string')
		array = array.split("");
	
	for (var i=0; i<array.length; i++) {
		if (array[i] === object) {
			return i;
		}
	}
	
	return -1;
});

elation.extend("utils.fixPNG", function() {
  if (elation.browser.type == "msie" && elation.browser.version <= 6) {
    //FIXME this breaks fixpng, I'm commenting it out, if this breaks other things... well, if you happen to see this comment maybe it will inspire you to try uncommenting out the line below to see if that has an effect -- mac daddy
    document.execCommand("BackgroundImageCache",false,true);
    var imglist = document.getElementsByTagName("img");
    for (var i = 0; i < imglist.length; i++) {
      if(imglist[i].src.substr(imglist[i].src.length - 3, 3) == "png" && !imglist[i].style.filter) {
        var origsrc = imglist[i].src;
        imglist[i].src = '/images/misc/nothing.gif';
        imglist[i].style.filter = "progid:DXImageTransform.Microsoft.AlphaImageLoader(src='" + origsrc + "', sizingMethod='image')";
      }
    }
  }
});

elation.extend("utils.stringify", function() {
  var value, ret = '';
  
  for (var key in parms) {
    value = parms[key];
    ret += key + '=' + value + '&'; 
  }
  
  return ret.substr(0,ret.length-1);
});

elation.extend('JSON', new function() {
  this.parse = function(text) {
    return this.JSON(['decode','parse'],text);
  },
  
  this.stringify = function(text) {
    return this.JSON(['encode','stringify'],text);
  },
  
  this.JSON = function(parms,text) {
		var key = typeof JSON[parms[0]] == 'function' 
			? parms[0]
			: parms[1];
    
		return JSON[key](text);
  }
});
elation.extend('cookie', {
	set: function(parms, value, expires, domain, secure, path, date) {
		name = parms.name || parms;
		expires = parms.expires || expires || '';
    domain = parms.domain || domain || '';
    secure = parms.secure || secure || '';
    path = parms.path || path || '/';
		date = parms.date || new Date();
		
		if (date instanceof Date)
			date = date.getDate() + "/" + (date.getMonth() + 1) + "/" + (date.getFullYear() + 1);
		
    var curCookie = name + "=" + escape(value) + "; expires=" + date + " 00:00:00" +
        ((path) ? "; path=" + path : "") +
        ((domain) ? "; domain=" + domain : "") +
        ((secure) ? "; secure" : "");
		
    document.cookie = curCookie;
    return curCookie;
	},
	
	get: function(name) {
    var theCookies = document.cookie.split(/[; ]+/);
    
		for (var i = 0 ; i < theCookies.length; i++) {
			var aName = theCookies[i].substring(0, elation.utils.indexOf(theCookies[i], '='));
			
			if (aName == name) 
				return theCookies[i];
    }
	}
});
elation.extend("find", function(selectors, parent, first) {
  /*
    selector engine can use commas, spaces, and find classnames via period.
    need to add id support and multiple classname on single tag support
    this code is used for browsers which dont have their own selector engines
    this could be made a lot better.
  */
  this.findCore = function(selectors, oparent) {
    var	selectors = selectors.split(','),
        elements = [],
        selector, section, tag, tags, classname, isParent, parent, parents;
    
    for (var s=0; s<selectors.length; s++) {
      parent = oparent || document.getElementsByTagName('BODY')[0];
      parents = [parent];
      section = selectors[s].split(' ');
      
      for (var p=0; parent = parents[p]; p++) {
        for (var q=0; q<section.length; q++) {
          isParent = (q = section.length - 1);
          selector = section[q].split('.');
          tag = selector[0] || '*';
          tags = parent.getElementsByTagName(tag);
          classname = selector.length > 1 ? selector[1] : false;
          
          for (var i=0; i<tags.length; i++) {
            if (classname) {
              if (elation.html.hasclass(tags[i], classname))
                if (isParent)
                  parents.push(tags[i]);
                else
                  elements.push(tags[i]);
            } else
              if (isParent)
                parents.push(tags[i]);
              else
                elements.push(tags[i]);
          }
        }
      }
    }
    
    return elements;
  }

  var result;
  
  if (elation.utils.isTrue(parent)) {
    first = true;
    parent = null;
  }
  
  if (document.querySelectorAll) 
    result = (parent) 
      ? parent.querySelectorAll(selectors) 
      : document.querySelectorAll(selectors);
  else
    result = this.findCore(selectors, parent);
  
  if (first && typeof result == 'object')
    if (result.length > 0)
      result = result[0];
    else
      result = null;
  
  return result;
});

// grabs a js or css file and adds to document
elation.extend('file.get', function(type, file, func) {
  if (!type || !file)
    return false;
  
  var	head = document.getElementsByTagName("HEAD")[0],
      element = document.createElement((type == 'javascript' ? "SCRIPT" : "LINK"));
  
  if (type == 'javascript') {
    element.type = "text/javascript";
    element.src = file;
  } else {
    element.type = "text/css";
    element.rel = "stylesheet";
    element.href = file;
  }
  
  if (func)
    element.onload = func;
  
  head.appendChild(element);
  
  return element;
});

// create file.batch object for grabbing multiple files
elation.extend('file.batch', function() {
	this.callbacks = [];
	this.files = [];
	
	this.add = function(url, type, component) {
		if (typeof url == 'string') {
      var dependency = elation.file.dependencies.add(url, this, type, component)
      
			if (dependency) 
        this.files.push(dependency);
    }
	}
	
	this.callback = function(script) {
		this.callbacks.push(script);
		
		if (this.files.length == 0)
			this.done(true);
	}
	
	this.done = function(url) {
		if (url)
			for (var i=0; i<this.files.length; i++) 
				if (!this.files[i].loaded && this.files[i].type != 'css') 
					return;
		
		for (var i=0; i<this.callbacks.length; i++) 
			switch (typeof this.callbacks[i]) {
				case "string": 
					eval(this.callbacks[i]); 
					break;
				
				case "function": 
					this.callbacks[i](); 
					break;
			}
		
		this.callbacks = [];
	}
});

// ajaxlib uses this to keep track of which css/js files are loaded and fetch ones that arent.
elation.extend('file.dependencies', new function() {
	this.host = '';
	this.files = {};
	this.registered = { 
		javascript: {}, 
		css: {} 
	};
	this.waiting = { 
		javascript: {}, 
		css: {} 
	};
	
	this.register = function(sFile, check, type) {
    var	type = type || 'javascript',
				registered = this.registered[type],
				waiting = this.waiting[type];
		
		if (registered[sFile])
			return;
		
    if (typeof check == 'undefined')
      check = true;
		
		registered[sFile] = true;
		
		if (waiting[sFile]) {
			var	url = waiting[sFile],
					file = this.files[url],
					components = this.getComponents(url);
			
			delete waiting[sFile];
      
      this.checkWaiting(file, components, type);
		}
	}
  
	this.registerMany = function(components, type) {
    for (var k in components) 
      if (components.hasOwnProperty(k) && components[k].length > 0) 
        for (var i = 0; i < components[k].length; i++) 
          if (components[k][i] != null)
            this.register(k + '.' + components[k][i], false, type);
  }
  
  this.checkWaiting = function(file, components, type) {
		var	type = type || 'javascript',
				waiting = this.waiting[type],
				flag = true;
    
		for (var i=0; i<components.length; i++) {
			if (waiting[components[i]]) {
				flag = false;
				
				break;
			}
		}
		
		if (flag) 
			this.done(file);
  }
	
	this.getComponents = function(url) {
		var	ret = [],
				url = url.split('?'),
				page = url[0],
				parms = url.length > 1
					? url[1].split('&')
					: [];
		
		for (var i=0; i<parms.length; i++) {
			var parm = parms[i].split('='),
					files = parm[1].split('+');
			
			for (var f=0; f<files.length; f++) {
				file = parm[0] +'.'+ files[f];
				
				ret.push(file);
			}
		}
		
		return ret;
	}
	
	this.wait = function(url, type) {
		var	type = type || 'javascript',
				registered = this.registered[type],
				waiting = this.waiting[type],
				components = this.getComponents(url);
		
		for (var i=0; i<components.length; i++)
			if (!registered[components[i]]) 
				waiting[components[i]] = true;
		
		url = this.url(waiting);
		
		for (var key in waiting)
			waiting[key] = '/' + (type == 'css' ? 'css' : 'scripts') + '/main' + url;
		
		return url;
	}
	
	this.url = function(oParms) {
		var	parms = {},
				ret = '';
		
		for (var key in oParms) {
			parm = key.split('.');
			
			if (!parms[parm[0]])
				parms[parm[0]] = [];
			
			parms[parm[0]].push(parm[1]);
		}
		
		for (var key in parms) {
			ret += (ret == '' ? '?' : '&') + key + '=';
			
			for (var i=0; i<parms[key].length; i++) {
				if (parms[key][i] != 'map')
					ret += parms[key][i] + (i == parms[key].length-1?'':'+');
				else if (i == parms[key].length-1)
					ret = ret.substr(0,ret.length-1);
			}
		}
		
		if (ret.indexOf("=") < 0)
			ret = '';
		
		return ret;
	}
	
	this.done = function(oFile) {
    if (typeof oFile != 'undefined') {
  		oFile.loaded = true;
			
	  	if (oFile.batch)
		  	oFile.batch.done(oFile.url);
    }
	}
	
	this.add = function(url, batch, type, component) {
		var	file = this.files[url] || {},
				type = type || 'javascript';
		
		if (!elation.utils.isNull(file.url)) {
			if (batch) {
				batch.done(url);
				
				return file;
			}
		}
		
		if (component || type == 'css') {
			url = this.wait(url, type);
			
			if (url) 
				url = '/' + (type == 'css' ? 'css' : 'scripts') + '/main' + url;
			else 
				return false;
		}
		
		file.batch = batch;
		file.loaded = false;
		file.url = url;
		file.type = type;
		file.element = elation.file.get(type, this.host + url, (
			(component)
				? null
				: (function(self) { 
						self.done(file); 
					})(this)
		));
		
		this.files[url] = file;
		
		return file;
	}
});

elation.extend('ui.getCaretPosition', function(oField) {
	// Initialize
	var iCaretPos = 0;

	// IE Support
	if (document.selection) { 
		// Set focus on the element
		oField.focus();
		
		// To get cursor position, get empty selection range
		var oSel = document.selection.createRange ();
		
		// Move selection start to 0 position
		oSel.moveStart('character', -oField.value.length);
		
		// The caret position is selection length
		iCaretPos = oSel.text.length;
	}
	
	// Firefox support
	else if (oField.selectionStart || oField.selectionStart == '0')
		iCaretPos = oField.selectionStart;
	
	// Return results
	return iCaretPos;
});


/*
**  Sets the caret (cursor) position of the specified text field.
**  Valid positions are 0-oField.length.
*/
elation.extend('ui.setCaretPosition', function(oField, iCaretPos) {
	// IE Support
	if (document.selection) { 
		// Set focus on the element
		oField.focus();
		
		// Create empty selection range
		var oSel = document.selection.createRange ();
		
		// Move selection start and end to 0 position
		oSel.moveStart('character', -oField.value.length);
		
		// Move selection start and end to desired position
		oSel.moveStart('character', iCaretPos);
		oSel.moveEnd('character', 0);
		oSel.select();
	}
	
	// Firefox support
	else if (oField.selectionStart || oField.selectionStart == '0') {
		oField.selectionStart = iCaretPos;
		oField.selectionEnd = iCaretPos;
		oField.focus();
	}
});

elation.extend('ui.combobox', function(parent, callback) {
	this.visible = false;
	this.parent = parent;
	this.callback = callback;
	
	this.init = function() {
		var	selects = elation.find("select.tf_search_input_sub_navigation", this.parent),
				select, dim, combobox, label, button, ul, lis, img, option, actions, options;
		
		for (var i=0; i<selects.length; i++) {
			select = selects[i];
			options = [];
			
			combobox = this.combobox = elation.html.create({
				tag: 'div',
				classname: 'tf_combobox',
				append: select.parentNode,
				before: select
			});
			
			label = this.label = elation.html.create({
				tag: 'div',
				classname: 'tf_combobox_label',
				append: combobox
			});
			
			button = this.button = elation.html.create({
				tag: 'div',
				classname: 'tf_combobox_button',
				append: combobox
			});
			
			img = elation.html.create({
				tag: 'div',
				classname: 'tf_combobox_image',
				append: button
			});			
			
			ul = this.ul = elation.html.create({
				tag: 'ul',
				classname: 'tf_combobox_options',
				append: combobox
			});
			
			label.innerHTML = select.options[select.selectedIndex].innerHTML;
			
      for (var s=0; s<select.options.length; s++) {
				option = select.options[s];
				
				li = elation.html.createv({
					tag: 'li',
					classname: 'tf_combobox_option',
					append: ul,
					attributes: {
						innerHTML: option.innerHTML
					}
				});
				
				options.push({ 
					li: li, 
					label: option.innerHTML, 
					value: option.value 
				});
			}
			
			this.options = options;
			this.actions = actions;
			
			this.ul.style.display = 'block';
			this.height = this.ul.offsetHeight;
			this.ul.style.display = 'none';
			
      elation.events.add(combobox, 'click', this);
			
			select.parentNode.removeChild(select);
		}
	}
	
	this.show = function() {
		this.visible = true;
		
		elation.html.addclass(this.button, 'selected');
		
		$TF(this.ul)
			.css({ display: 'block', height: 0 })
			.animate({ height: this.height + 'px' }, 150, "easein");
	}
	
	this.hide = function() {
		this.visible = false;
		
		elation.html.removeclass(this.button, 'selected');
		
		(function(self) {
			$(self.ul)
				.animate({ height: 0 }, 200, "easeout", function() { self.ul.style.display = 'none'; });
		})(this);
	}
	
	this.toggle = function(target) {
		this.visible
			? this.hide()
			: this.show();
		
		if (target.nodeName == 'LI')
			this.callback(target, this);
	}
	
	this.handleEvent = function(event) {
		var type = event.type || window.event,
				target = event.target || event.srcElement;
		
		switch (type) {
			case 'click': this.toggle(target); break;
			case 'mouseover': break;
			case 'mouseout': break;
		}
	}
	
	this.init();
});

elation.extend('data', new function() {
	this.add = function(name, data) {
		if (!this[name])
			this[name] = [];
		
		for (var i=0; i<data.length; i++)
			this[name].push(data[i]);
	}
	
	this.find = function(name, path, value) {
		if (elation.utils.isNull(this[name]))
			return false;
		
		for (var i=0; i<this[name].length; i++) {
			var item = this[name][i],
					property = elation.utils.arrayget(item, path);
			
			if (property == value)
				return item;
		}
		
		return false;
	}
});

// execute callback onhover
elation.extend('ui.hover', function() {
  this.init = function(element, mouseover, mouseout, alternate, click) {
    if (!element || !mouseover || !mouseout)
      return;
    
    this.element = element;
    this.mouseover = mouseover;
    this.mouseout = mouseout;
		this.click = click;
    this.alternate = alternate || element;
    
    elation.events.add(element, "mouseover,mouseout", this);
    
		// onclick is optional
		if (click)
			elation.events.add(this.alternate, "click", this);
  }
  
  this.handleEvent = function(event) {
    var	event = this.event = event || window.event,
        target = this.target = event.target || event.srcElement,
				related = this.related = elation.events.getRelated(event);
    
		if (this.checkRelated(target, related))
			return;
		
    switch(event.type) {
      case "mouseover":
        this.mouseover();
        break;
      
      case "mouseout":
        this.mouseout();
        break;
      
			case "click":
        this.click();
        break;
    }
  }
	
	this.checkRelated = function(target, related) {
 		while (!elation.utils.isNull(related)) { 
 			if (related == this.element)
				return true;
			
			related = related.parentNode;
		}
		
		return false;
	}
});

elation.extend('log_size', function(result_view_id) {
	if (typeof result_view_id == 'undefined')
		result_view_id = '';
	
	if (window.innerWidth) 
		var	tr_width = window.innerWidth,
				tr_height = window.innerHeight;
	else 
		if (document.body.offsetWidth) 
			var	tr_width = document.body.offsetWidth,
					tr_height = document.body.offsetHeight;
	
	if (elation.ajax) {
    elation.ajax.Get('/page/sizelog?width=' + tr_width + '&height=' + tr_height + '&result_view_id=' + result_view_id);
  }
});

tr_size = elation.log_size;
