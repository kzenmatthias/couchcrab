-- Generated poster art is gone: a series with art settings gets the automatic poster (the first episode).
UPDATE `series` SET `poster` = NULL WHERE json_valid(`poster`) AND json_extract(`poster`, '$.type') = 'art';
