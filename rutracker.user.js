// ==UserScript==
// @name         Rutracker+Kinopoisk
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @include	https://kinopoisk.ru/level/1/film/*
// @include	https://www.kinopoisk.ru/level/1/film/*
// @include	https://www.kinopoisk.ru/film/*
// @include	https://rutracker.org/forum/*
// @require https://code.jquery.com/jquery-1.6.4.min.js
// @connect rutracker.org
// @connect www.kinopoisk.ru
// @grant        GM_xmlhttpRequest
// ==/UserScript==
/* jshint -W097 */
"use strict";
var common =
{
    showMessage: function(text)
    {
        $('<div style="width: 260px; background: white; border: 1px solid #217487; -webkit-border-radius: 5px; \
        position: fixed; top: 7px; right: 8px; padding: 10px; -webkit-box-shadow: black -1px 1px 7px; \
        font-size:10px">'+text+'</div>').appendTo($('body'));
    }
};


var rt =
{
    search_url: 'https://rutracker.org/forum/tracker.php',
    torrents_base_url: 'https://rutracker.org/forum/',

    header_selector: '#tor-tbl > thead > tr',
    line_selector: '#tor-tbl > tbody > tr',
    title_column_index: 3,
    seeds_column_index: 7,
    leechers_column_index: 8,
    size_column_index: 6,

    parse_info_string: function($info_row)
    {
        var $info_el = $info_row.find('td:eq(' + this.title_column_index + ') a');
        if(!$info_el.html()) return;

        var seeds_count = $info_row.find('td b.seedmed').html();
        if (!seeds_count) return;

        var leechers_count = $info_row.find('td.leechmed b').html();
        var size = $info_row.find('td.tor-size a').html().replace(' ↓','');

        var matches = $info_el.html()
            .replace(/<wbr>/g, '')
            .match(/^([^\(^<]+)[^\[]+\[([^\]]+)](.*)/i);
        if(!matches) return;

        //decode html entities
        var titles_str = $("<div/>").html(matches[1].replace(/<wbr>/g, '')).text();
        var titles = titles_str.split('/');

        var video = matches[2].split(',');
        video = $.trim(video[video.length - 1]);
        var audio = $.trim(matches[3]);

        var href = $info_el.attr('href');
        var href_dl = 'dl.php?t='+href.match(/(\d+)$/)[0];

        var result = {
            title_ru: $.trim(titles[0]),
            title_orig: $.trim(titles.length == 2 ? titles[1] : titles[0]),
            title_full: titles_str,
            video: video,
            audio: audio,
            href : href,
            href_dl: href_dl,
            quality: video+(audio ? ' / '+audio : ''),
            seeds: seeds_count || 0,
            leechers: leechers_count,
            size: size
        };
        return result;
    }
};

var kp =
{
    rating_by_title_url: 'https://www.kinopoisk.ru/search/chrometoolbar.php?v=1&query=',
    movie_by_title_url: 'https://www.kinopoisk.ru/index.php?first=yes&kp_query=',
};

function main_rutracker()
{
    if(null == document.getElementById('tor-tbl')) return;

    var default_font_size = '12px';

    $(rt.header_selector+' th:eq('+rt.title_column_index+')').after('<th>Рейтинг</th>');
    $(rt.line_selector).each(function() {
        $(this).find('td:eq('+rt.title_column_index+')').after('<td class="row4">&hellip;</td>');
    });

    $(rt.line_selector).each(function(top_index, top_el)
    {
        var $top_el = $(top_el);
        if(0 == $top_el.parent().length) return;
        var top_info = rt.parse_info_string($top_el);
        if(!top_info) return;

        var encoded_title = encodeURIComponent(top_info.title_orig);
        GM_xmlhttpRequest({
            method:"GET",
            url: kp.rating_by_title_url+encoded_title,
            onload: function(r) {
                debugger;
                var res = JSON.parse(r.responseText);
                var $el = $top_el.find('td:eq('+(rt.title_column_index+1)+')');
                if(undefined == res.rating) {
                    $el.html('-');
                    return;
                }
                var font_size = 9 + 6 * (parseFloat(res.rating) - 6);
                $el.html('<a class="bold" style="font-size:'+font_size+'px !important;text-decoration:none" href="'+kp.movie_by_title_url+encoded_title+'">'
                         +(res.rating)+'</a>');
            }
        });

        $(rt.line_selector).each(function(child_index, child_el)
        {
            if(top_el.isSameNode(child_el)) return;
            var child_info = rt.parse_info_string($(child_el));
            if(!child_info) return;

            if(top_info.title_orig.toLowerCase() == child_info.title_orig.toLowerCase())
            {
                //console.log(child_info);
                var $title = $(top_el).find('td:eq('+(rt.title_column_index)+')');
                var $span = $title.find('div[class="variants"]');
                if(!$span.length)
                {
                    $span = $('<div class="variants" style="display:none"></div>')
                        .insertAfter($title.find('a:first'));
                    $('<a href="#" class="toggle" style="border-bottom:1px dashed #069;text-decoration:none;margin-left:10px">другие варианты</a>')
                        .insertAfter($title.find('a:first'));
                }
                $span.append(
                    '<p><a href="'+child_info.href+'">'
                    +child_info.video+' / '+child_info.audio+
                    '</a> <span title="раздающие/качающие">SE:'+child_info.seeds+'/LE:'+child_info.leechers+', '+child_info.size+'</span></p>'
                );
                $(child_el).remove();
            }
        });
    });

    jQuery('a.toggle').bind('click', function(){
        $(this).parent().find('.variants').toggle();
        return false;
    });
}

function main_kinopoisk()
{
    function is_logged_on_rutracker(rt_response)
    {
        return null == rt_response.match('method="post" action="login.php">');
    }

    function render_torrents(title_ru, rt_response)
    {
        var is_torrent_found = false;
        var onClickClose = 'onclick="var p = $(this).parent(); if(p.is(&quot;.closed&quot;)){p.removeClass(&quot;closed&quot;);}else{p.addClass(&quot;closed&quot;);}"';
        var base_template = $(
            '<div class="friendsByInterests closed" style="width: auto; margin-right: -140px; margin-left: -22px;">'+
                '<div class="switch" '+onClickClose+'></div>'+
                '<div class="top" '+onClickClose+'>'+
                    '<div style="float:left;"><span class="link link_friend">Торренты с rutracker.org</span></div>'+
                    '<div class="friend average link green" style=""><span>Сидеры</span></div>'+
                '</div>'+
                '<div class="list friend resultList"><div></div></div>'+
            '</div>'
        );
        var resultList = base_template.find('.resultList div');

        $(rt_response).find(rt.line_selector).each(function() {
            if(!is_torrent_found)
                $torrents_container.html('');
            var torrent_info = rt.parse_info_string($(this));
            if(!torrent_info || torrent_info.title_ru != title_ru)
                return;
            var info_url = rt.torrents_base_url+torrent_info.href;
            var torrent_url = rt.torrents_base_url+torrent_info.href_dl;

            resultList.append(
                '<div class="item">'+
                    '<div class="userPic" style="text-align: center; padding-top: 4px;"><a href="'+torrent_url+'"><img class="coverBG" style="height: 22px; width: 22px;" src="https://static.t-ru.org/templates/v1/images/attach_big.gif" alt=""></a></div>'+
                    '<div class="dots"><div class="name"><a href="'+info_url+'" style="display: inline">'+torrent_info.quality+'<span>'+torrent_info.size+'</span><i></i></a></div></div>'+
                    '<div class="status" style="line-height: 28px;">'+torrent_info.seeds+'</div>'+
                '</div>'
            );
            is_torrent_found = true;
        });

        return is_torrent_found ? base_template : null;
    }

    $('<tr><td colspan="2" class="torrents">Ищем торренты...</td></tr>').appendTo('table.info');
    var $torrents_container = $('table.info td.torrents');
    var title_ru = $.trim($('#headerFilm > h1.moviename-big').html());
    var title_full =  title_ru + ' / ' + $.trim($('#headerFilm > span').html());

    if(title_full.length > 60){title_full = title_ru;}
    var full_search_url = rt.search_url+'?nm='+encodeURIComponent(title_full)+'&o=10&s=2';

    GM_xmlhttpRequest({
        method:"GET",
        url: full_search_url,
        onerror: function(e){ console.log(e); },
        onload: function(r) {
            var data = r.responseText;
            if(!is_logged_on_rutracker(data))
                $torrents_container.html('Залогиньтесь на <a href="https://rutracker.org" target="_blank">rutracker.org</a>, и мы начнем вам показывать ссылки на торренты.');
            else
            {
                $torrents_container.html(render_torrents(title_ru, data) || 'Мы не нашли, <a href="'+full_search_url+'">попробуйте сами</a>');
            }
        }
    });
}

if(window.location.href.match(/^https:\/\/www.kinopoisk.ru/i))
    main_kinopoisk();
else
    main_rutracker();
