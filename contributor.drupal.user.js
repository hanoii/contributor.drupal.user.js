// ==UserScript==
// @name         Project's usage on your profile page
// @namespace    https://www.drupal.org/u/hanoii
// @version      2019.03.20.2
// @description  Adds colored badges of usage to the projects you created/maintain.
// @author       Ariel Barreiro
// @include      /https:\/\/www.drupal.org\/u\/.+$/
// @include      /https:\/\/www.drupal.org\/user\/[0-9]+$/
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        unsafeWindow
// @require      https://code.jquery.com/jquery-3.3.1.min.js
// @require      https://cdn.jsdelivr.net/gh/wikimedia/jquery-badge/jquery.badge.js
// @resource     jquery.badge https://cdn.jsdelivr.net/gh/wikimedia/jquery-badge/jquery.badge.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.24.0/moment.min.js
// ==/UserScript==

(function() {
  'use strict';
  var $ = jQuery.noConflict(true);
  var localStorage = unsafeWindow.localStorage;

    // Do nothing if not logged.
    if (!$('body').hasClass('logged-in')) {
      return;
    }

    // Get cache / Bust if necessary
    // If the cache schema changes, make sure to increase this variable number so that updatd scripts will bust it.
    var cache_schema_version = 2;
    var cache_projects = JSON.parse(localStorage.getItem('hanoii/contributor.drupal.user.js:cache'));
    if (!cache_projects) {
      cache_projects = {};
    }
    if (!cache_projects.version || cache_projects.version != cache_schema_version) {
      // Bust you!
      cache_projects = {};
    }
    if (cache_projects.expire && moment().isAfter(cache_projects.expire)) {
      // Bust you!
      cache_projects = {};
    }
    if ($.isEmptyObject(cache_projects)) {
      cache_projects = {
        version: cache_schema_version,
        projects: {},
        // Expire next Sunday - I believe stats are updated weekly.
        expire: moment().startOf('isoWeek').subtract(1, 'day').add(1, 'week')
      };
    }

    // Make sure we are watching our own profile page
    // TODO: Is there a better way of doing this?
    $.get('/user', function(data) {
      // This is so I can also query the metas of the response.
      var $html = $('<div></div>').html(data);
      var logged_in_profile = $('meta[property="profile:username"]', $html).attr("content");
      var current_profile = $('meta[property="profile:username"]').attr('content');

      if (logged_in_profile == current_profile) {
        GM_addStyle(GM_getResourceText ("jquery.badge"));

        var $projects = $('ul.versioncontrol-project-user-commits > li > a');

        // Each project will be a promise that will be resolved by fetching data
        // or from cache
        var promises = [];

        // Only query for actual drupal projects, filtering out sandboxes and
        // other stuff.
        var $projects_to_check = [];
        $projects.each(function (index, value) {
          var url = $(value).attr('href');
          if (url.match(/^\/project/)) {
            promises.push($.Deferred());
            $projects_to_check.push($(value));
          }
        });

        // Go get the usage
        $projects_to_check.forEach(function ($project, index) {
          var url = $project.attr('href');
          var project_data = {};

          if (cache_projects.projects[url]) {
            project_data = cache_projects.projects[url];
            promises[index].resolve($project, project_data);
          }
          else {
            $.get(url, function(data) {
              var $html = $(data);
              var total = $('.project-info a > strong', $html).text();
              if (!total) {
                total = '0';
              }
              total = parseInt(total.replace(',', ''));
              var me_as_maintainer = $('#block-versioncontrol-project-project-maintainers a.username:contains(hanoii)', $html);
              var me_as_author = $('.node-project-module .submitted a.username:contains(hanoii)', $html);
              if (me_as_author.length) {
                project_data.owner = true;
                project_data.total = total;
              }
              else if (me_as_maintainer.length) {
                project_data.total = total;
                project_data.maintainer = true;
              }
              cache_projects.projects[url] = project_data;
              promises[index].resolve($project, project_data);
            });
          }
        });

        // After all of our promises are resolved, alter DOM as necessary
        $.when.apply($, promises).done(function() {
          localStorage.setItem('hanoii/contributor.drupal.user.js:cache', JSON.stringify(cache_projects));

          // Add badges
          $.each(arguments, function(index, value) {
            var $project = value[0];
            var data = value[1];

            var bgcolor, color;
            if (data.owner) {
              bgcolor = 'green';
              color = 'white';
              $project.parent().data('owner', true);
            }
            if (data.maintainer) {
              bgcolor = 'yellow';
              color = 'black';
            }
            if (color) {
              $project.parent().css('position', 'relative').badge(data.total).children('.notification-badge').css('background-color', bgcolor).children('.notification-badge-content').css('color', color);
              $project.parent().data('total', data.total);
            }
          });

          // Project list orderd by authored/maintainer/usage
          $('ul.versioncontrol-project-user-commits > li').sort(function(a, b) {
            var total1 = $(a).data('total');
            var total2 = $(b).data('total');
            var owner1 = $(a).data('owner');
            var owner2 = $(b).data('owner');

            if (!total1 && !total2) return 0;
            if (total1 && !total2) return -1;
            if (!total1 && total2) return 1;

            if (owner1 && !owner2) return -1;
            if (!owner1 && owner2) return 1;

            if (total1 > total2) return -1;
            if (total1 < total2) return 1;
            return 0;
          }).appendTo('ul.versioncontrol-project-user-commits');
        });
      }
    });

  })();
