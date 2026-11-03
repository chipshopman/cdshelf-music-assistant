package Plugins::CDShelf::Settings;

use strict;
use warnings;

use base qw(Slim::Web::Settings);
use Slim::Web::HTTP::CSRF;

sub name {
    return Slim::Web::HTTP::CSRF->protectName('PLUGIN_CDSHELF');
}

sub page {
    return Slim::Web::HTTP::CSRF->protectURI('plugins/CDShelf/settings/basic.html');
}

1;
