<ul>
{foreach from=$ormcfg->classes key=classname item=ormclass}
 <li>
  {component name="orm.view_class" ormcfg=$ormclass}
 </li>
{/foreach}
</ul>