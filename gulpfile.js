'use strict'
const gulp = require('gulp');
const merge = require('merge-stream');
const sass = require('gulp-sass');
const cleancss = require('gulp-clean-css');
const concat = require('gulp-concat');
const replace = require('gulp-replace');
const iconfont = require('gulp-iconfont');
const svgmin = require('gulp-svgmin');
const consolidate = require('gulp-consolidate');
const rename = require('gulp-rename');
const foreach = require('gulp-foreach');
const exec = require('child_process').exec;
const babel = require('gulp-babel');
const uglify = require('gulp-uglify');
const del = require('del');
const util = require('gulp-util');
const zip = require('gulp-zip');
const ftp = require('vinyl-ftp');
const minimist = require('minimist');
let deployargs = minimist(process.argv.slice(2));
let conn = ftp.create({
    host: deployargs.host,
    user: deployargs.user,
    password: deployargs.password,
    log: util.log
});
let timestamp = Math.round(Date.now() / 1000);

gulp.task('default', ['cachebust']);

//clean generated files
gulp.task('clean', ()=> {
    return del(['dist', 'doc/_site', 'doc/css/catfw.min.css', 'doc/css/fonts/catif.*', 'doc/js/catfw.min.js','doc/files/*.*', '!doc/files/placeholders/*']);
});

//generate icon font from svg files
gulp.task('iconfont', ['clean'], () => {
    let fsiconfont = gulp.src('fonts/svg/*.svg')
        //minify svg source files
        .pipe(foreach((stream, file) => {
            return stream
                .pipe(svgmin())
                .pipe(concat(file.path))
        }))
        // generate icon font
        .pipe(gulp.dest('fonts/svg'))
        .pipe(iconfont({
            normalize: true,
            fontHeight: 1000,
            descent: 64,
            fontName: 'catif',
            metadata: 'Catenology Icon Font',
            version: 'v1.0',
            appendCodepoints: true,
            fontPath: 'fonts',
            formats: ['ttf', 'eot', 'woff', 'svg'],
            timestamp: timestamp
        }))
        //generate _icons.scss
        .on('glyphs', (glyphs) => {
            let options = {
                fontName: 'catif',
                fontPath: 'fonts/',
                className: 'catif',
                timestamp: timestamp,
                glyphs: glyphs.map(function(glyph) {
                    return {
                        codepoint: glyph.unicode[0].charCodeAt(0).toString(16).toUpperCase(),
                        name: glyph.name
                    }
                })
            };
            glyphs.forEach((glyph, idx, arr) => {
                arr[idx].glyph = glyph.unicode[0].charCodeAt(0).toString(16).toUpperCase()
            });
            gulp.src('fonts/_template.scss')
                .pipe(consolidate('lodash', options))
                .pipe(rename('_icons.scss'))
                .pipe(gulp.dest('sass/'));
        })
        .pipe(gulp.dest('dist/fonts/'));
    return fsiconfont;
});

//compile stylesheet
gulp.task('styles', ['iconfont'], () => {
    let fsstyles = gulp.src('sass/main.scss')
        //compile sass
        .pipe(sass())
        .pipe(rename('catfw.css'))
        .pipe(gulp.dest('dist'))
        //minify
        .pipe(cleancss({compatibility: 'ie8'}))
        .pipe(rename('catfw.min.css'))
        .pipe(gulp.dest('dist'));
    return fsstyles;
});

//compile javascript
gulp.task('scripts', ['styles'], () => {
    let fsscripts = gulp.src('js/main.js')
        //compile babel
        .pipe(babel({
            presets: ['es2015']
        }))
        .pipe(rename('catfw.js'))
        .pipe(gulp.dest('dist'))
        //minify
        .pipe(uglify())
        .pipe(rename('catfw.min.js'))
        .pipe(gulp.dest('dist'));
    return fsscripts;
});

//zip dist folder files
gulp.task('zip', ['scripts'], () => {
    let fszip = gulp.src('dist/**')
        .pipe(zip('catfw.zip'))
        .pipe(gulp.dest('dist'));
    return fszip;
});

//copy files
gulp.task('copyfiles', ['zip'], () => {
    //files for downloading
    let fsdist = gulp.src('dist/**')
        .pipe(gulp.dest('doc/files'));
    //files for documentation site
    let fscss = gulp.src(['dist/*.min.css'])
        .pipe(gulp.dest('doc/css'));
    let fsfonts = gulp.src(['dist/fonts/*.ttf', 'dist/fonts/*.woff', 'dist/fonts/*.svg', 'dist/fonts/*.eot'])
        .pipe(gulp.dest('doc/css/fonts'));
    let fsjs = gulp.src(['dist/*.min.js'])
        .pipe(gulp.dest('doc/js'));
    // merge stream
    let fscopyfiles = merge(fsdist, fscss, fsfonts, fsjs);
    return fscopyfiles;
});

gulp.task('jekyll', ['copyfiles'], (cb) => {
    //jekyll build the site
    exec(['jekyll b --source doc --destination doc/_site'], function(err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        cb(err);
    })
});

//add timestamp to static assets to bust cache
gulp.task('cachebust', ['jekyll'], () => {
    let fscachebust = gulp.src(['doc/_site/**/*.html', 'doc/_site/**/*.md'])
        .pipe(replace(/@@hash/g, timestamp))
        .pipe(gulp.dest('doc/_site/'));
    return fscachebust;
});

//ftp deployment
gulp.task('deploy', ['cleanremote'], () => {
    let fsdeploy = gulp.src('doc/_site/**/*.*')
        .pipe(conn.dest('catfw'));
    return fsdeploy;
});

//clean remote folder on ftp server
gulp.task('cleanremote', (cb) => {
    return conn.rmdir('catfw', function(err) {
        cb();
    });
});
